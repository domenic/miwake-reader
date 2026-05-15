import { gDriveClientId, oneDriveClientId, pagePath } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import {
  isRemoteContext,
  type FsHandle,
  type RemoteContext
} from '$lib/data/storage/storage-source-types';
import { clearOAuthTokenCache, StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import {
  cloudCustomCredentials$,
  syncState,
  type CloudProviderType,
  type CustomOAuthCredentials,
  type SyncLocation
} from '$lib/data/sync/sync-store.svelte';
import { pushAllLocalBooks } from '$lib/data/sync/sync-engine';
import {
  pruneUnreachablePlaceholders,
  reconcilePlaceholders
} from '$lib/data/sync/placeholder-reconciler';
import { cloudSourceName, FS_SOURCE_NAME, isCustomCloudName } from '$lib/data/sync/sync-helpers';

function readCustomCreds(provider: CloudProviderType): CustomOAuthCredentials | undefined {
  return cloudCustomCredentials$.getValue()[provider];
}

/**
 * Roll back the storageSource record we just wrote. If a record
 * existed before, restore it (so its previous refresh token survives
 * a failed reconnect); otherwise drop the placeholder we wrote.
 */
async function restoreOrDropStorageSource(
  name: string,
  existing: BooksDbStorageSource | undefined
): Promise<void> {
  if (existing) {
    await database.saveStorageSource(existing, name);
    return;
  }
  const stored = await (await database.db).get('storageSource', name);
  if (stored) await database.deleteStorageSource(stored);
}

export interface LeaveOptions {
  /**
   * Wipe the user's downloaded books, bookmarks, statistics, and
   * goals from this device after disconnecting. Does NOT clear app
   * settings, themes, or custom OAuth credentials — those survive
   * (use the heavier "Sign out and wipe local data" action for a
   * full reset). Defaults to false; the caller's confirm dialog is
   * where this gets opted into.
   */
  clearLibrary?: boolean;
}

/**
 * Public connect / switch entry for a local folder. Must be called
 * inside a live user-activation window: showDirectoryPicker fails
 * without one. The activation can come either from a click handler
 * directly, or from the synchronous continuation of a dialog whose
 * Confirm button just resolved (the dialog click produces its own
 * transient activation that the continuation inherits). Don't add
 * unrelated awaits between the dialog resolve and the call here —
 * each one risks the activation timing out (~5s in Chromium).
 *
 * Covers fresh connect, change folder, switch from cloud, and
 * regrant after permission revoke. Dispatches on the current sync
 * location: same-source becomes an in-place replacement,
 * different-source goes through prior-teardown after the new
 * destination is validated.
 */
export async function connectFs(opts: ConnectFsOptions = {}): Promise<void> {
  const current = syncState.location;
  const directoryHandle = await window.showDirectoryPicker({
    id: 'miwake-reader-root',
    mode: 'readwrite'
  });
  await completeFsConnection(directoryHandle, {
    priorLocation: current?.kind === 'fs' ? null : current,
    clearLibrary: opts.clearLibrary
  });
}

/**
 * Public connect / switch entry for a cloud provider. Must be called
 * inside a live user-activation window: window.open is silently
 * popup-blocked without one. The activation can come either from a
 * click handler directly, or from the synchronous continuation of a
 * dialog whose Confirm button just resolved (the dialog click
 * produces its own transient activation that the continuation
 * inherits). The popup is opened before any other await here so the
 * activation is consumed by window.open rather than a later API call.
 * Don't add unrelated awaits between the dialog resolve and the call
 * here — each one risks the activation timing out (~5s in Chromium).
 *
 * Covers fresh connect, switch (incl. default ↔ custom OAuth on the
 * same provider), and reconnect.
 */
export async function connectCloud(
  provider: CloudProviderType,
  opts: ConnectCloudOptions
): Promise<void> {
  const current = syncState.location;
  const useCustom = opts.useCustomCredentials;
  const isSameSource =
    current?.kind === 'cloud' &&
    current.provider === provider &&
    current.usesCustomCredentials === useCustom;

  const authWindow = StorageOAuthManager.createWindow(
    `${pagePath}/auth?miwake-init-wait=1`,
    'auth',
    Math.min(Math.max(window.innerWidth, 300), 560),
    Math.min(Math.max(window.innerHeight, 300), 560),
    window
  );
  if (!authWindow) {
    throw new Error('Unable to open the sign-in window. Check your popup blocker settings.');
  }

  await completeCloudConnection(provider, authWindow, {
    priorLocation: isSameSource ? null : current,
    clearLibrary: opts.clearLibrary,
    useCustomCredentials: useCustom
  });
}

export type ConnectFsOptions = LeaveOptions;

export interface ConnectCloudOptions extends LeaveOptions {
  /**
   * Required so the caller commits to a mode. Each UI flow has a
   * single right answer: fresh Connect uses stored custom creds if
   * present, Reconnect stays in the current mode, Save-and-connect
   * activates custom, revert-to-default forces default.
   */
  useCustomCredentials: boolean;
}

interface CompleteOptions extends LeaveOptions {
  /**
   * The prior sync location to tear down after the new one validates,
   * or null when this is a same-source replace.
   */
  priorLocation: SyncLocation | null;
}

interface CompleteCloudOptions extends CompleteOptions {
  useCustomCredentials: boolean;
}

async function completeFsConnection(
  directoryHandle: FileSystemDirectoryHandle,
  opts: CompleteOptions
): Promise<void> {
  const fsPath = directoryHandle.name;

  const data: FsHandle = { directoryHandle, fsPath };
  const record: BooksDbStorageSource = {
    name: FS_SOURCE_NAME,
    type: SyncEndpointType.FS,
    data,
    lastSourceModified: Date.now()
  };

  const existing = await (await database.db).get('storageSource', FS_SOURCE_NAME);
  await database.saveStorageSource(record, existing ? FS_SOURCE_NAME : '');

  // Validate the new source before tearing down the old: a listing
  // failure (revoked handle, parse error) throws with the prior
  // connection still in place.
  const handler = getSyncEndpoint(window, SyncEndpointType.FS, FS_SOURCE_NAME);
  let books;
  try {
    books = await handler.listSyncTitles({ refresh: true });
  } catch (err) {
    await restoreOrDropStorageSource(FS_SOURCE_NAME, existing);
    throw err;
  }

  if (opts.priorLocation || opts.clearLibrary) {
    await teardownPriorLocation(opts.priorLocation, !!opts.clearLibrary);
  }

  // Clear lastSeenOnSource only after validation succeeds — a fresh
  // picker handle is always treated as a potentially-new folder, but
  // a failed listing must leave the prior connection's flags intact.
  // The reconcile + boot push below re-mark whatever ends up mirrored.
  await clearLastSeenOnSource();
  await reconcilePlaceholders(books);

  const now = Date.now();
  syncState.location = {
    kind: 'fs',
    path: fsPath,
    connectedAt: now,
    // The booklist + placeholder seed counts as a successful sync.
    lastSyncedAt: now
  };
  syncState.health = { status: 'ok' };

  // Mirror existing local content into the new folder. Ambient sync
  // only fires on local edits; without this, a fresh connect with an
  // empty folder would stay empty until the user happened to bookmark
  // something.
  await pushAllLocalBooks();
}

async function completeCloudConnection(
  provider: CloudProviderType,
  authWindow: Window,
  opts: CompleteCloudOptions
): Promise<void> {
  try {
    const customCreds = readCustomCreds(provider);
    const useCustom = opts.useCustomCredentials;
    const name = cloudSourceName(provider, useCustom);

    const existing = await (await database.db).get('storageSource', name);
    // Reuse a previously-stored refresh token if we have one for this
    // exact source: lets cloud → FS → cloud (or default ↔ custom on
    // the same provider) reconnect silently instead of forcing a fresh
    // OAuth popup. A blank string means "no usable RT, popup needed."
    const existingRT =
      existing && isRemoteContext(existing.data) ? (existing.data.refreshToken ?? '') : '';

    const remoteData: RemoteContext =
      useCustom && customCreds
        ? {
            clientId: customCreds.clientId,
            clientSecret: customCreds.clientSecret,
            refreshToken: existingRT,
            tokenEndpoint: customCreds.tokenEndpoint
          }
        : {
            clientId: provider === SyncEndpointType.GDRIVE ? gDriveClientId : oneDriveClientId,
            clientSecret: '',
            refreshToken: existingRT
          };

    const record: BooksDbStorageSource = {
      name,
      type: provider,
      data: remoteData,
      lastSourceModified: Date.now()
    };

    await database.saveStorageSource(record, existing ? name : '');

    // Drop the in-memory access token only when there's no stored RT
    // to fall back to: a stale cached AT paired with a fresh-but-empty
    // RT would short-circuit silently and leave nothing for the next
    // boot. With a stored RT, the cache is fine to keep — verifyToken
    // will refresh from it as needed.
    if (!existingRT) clearOAuthTokenCache(name);

    const handler =
      provider === SyncEndpointType.GDRIVE
        ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, name)
        : getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, name);

    try {
      await handler.authenticate(authWindow);
    } catch (err) {
      await restoreOrDropStorageSource(name, existing);
      throw err;
    }

    // Validate listing before any destructive teardown so a cloud
    // hiccup leaves the prior connection intact.
    let books;
    try {
      books = await handler.listSyncTitles({ refresh: true });
    } catch (err) {
      await restoreOrDropStorageSource(name, existing);
      throw err;
    }

    if (opts.priorLocation || opts.clearLibrary) {
      await teardownPriorLocation(opts.priorLocation, !!opts.clearLibrary);
    }

    // See completeFsConnection for the timing rationale.
    await clearLastSeenOnSource();
    await reconcilePlaceholders(books);

    const now = Date.now();
    syncState.location = {
      kind: 'cloud',
      provider,
      usesCustomCredentials: useCustom,
      connectedAt: now,
      lastSyncedAt: now,
      bookCount: books.length
    };
    syncState.health = { status: 'ok' };

    await pushAllLocalBooks();
  } finally {
    if (!authWindow.closed) {
      authWindow.close();
    }
  }
}

/**
 * Tear down a prior sync location's persistent state — the
 * storageSource record, OAuth in-memory cache (cloud only), and
 * (optionally) the local library. Called from completeCloudConnection
 * / completeFsConnection only after the new destination's listing
 * succeeded, so a canceled or popup-blocked switch leaves the user on
 * their existing connection.
 */
async function teardownPriorLocation(
  prev: SyncLocation | null,
  clearLibrary: boolean
): Promise<void> {
  if (prev) {
    const db = await database.db;
    const name =
      prev.kind === 'cloud'
        ? cloudSourceName(prev.provider, prev.usesCustomCredentials)
        : FS_SOURCE_NAME;
    const existing = await db.get('storageSource', name);
    if (existing) {
      await database.deleteStorageSource(existing);
    }
    if (prev.kind === 'cloud') {
      // Match the IDB state: the next cloud connect (even back to the
      // same source) starts from a clean cache and runs a fresh OAuth.
      clearOAuthTokenCache(name);
    }
  }

  if (clearLibrary) {
    await wipeLibraryContents();
  }
}

/**
 * Drop the `lastSeenOnSource` flag on every local book row. Called
 * when the active sync source changes (disconnect / switch); the
 * next source's reconcile + push will reset the flag for books that
 * are still mirrored there.
 */
async function clearLastSeenOnSource(): Promise<void> {
  const db = await database.db;
  const tx = db.transaction('data', 'readwrite');
  for await (const cursor of tx.store) {
    if (cursor.value.lastSeenOnSource) {
      const next = { ...cursor.value };
      delete next.lastSeenOnSource;
      await cursor.update(next);
    }
  }
  await tx.done;
}

/**
 * Tear down whatever sync location is currently configured. Idempotent
 * if nothing is connected. Drops in-memory OAuth tokens (for cloud) so
 * a same-tab reconnect re-runs the popup, deletes the IDB storageSource
 * record, prunes placeholders that are no longer reachable, and clears
 * the connection + health subjects.
 *
 * If `opts.clearLibrary` is true, also wipes the user's books,
 * bookmarks, statistics, and reading goals from this device — see
 * LeaveOptions.
 */
export async function disconnect(opts: LeaveOptions = {}): Promise<void> {
  const current = syncState.location;
  if (!current) {
    syncState.location = null;
    syncState.health = { status: 'ok' };
    if (opts.clearLibrary) {
      await wipeLibraryContents();
    }
    return;
  }

  const db = await database.db;
  const name =
    current.kind === 'cloud'
      ? cloudSourceName(current.provider, current.usesCustomCredentials)
      : FS_SOURCE_NAME;
  if (current.kind === 'cloud') {
    clearOAuthTokenCache(name);
  }
  const existing = await db.get('storageSource', name);
  if (existing) {
    await database.deleteStorageSource(existing);
  }

  syncState.location = null;
  syncState.health = { status: 'ok' };

  if (opts.clearLibrary) {
    await wipeLibraryContents();
    return;
  }

  // Clear lastSeenOnSource on every local book BEFORE the prune
  // below: pruneUnreachablePlaceholders treats books with the flag
  // set as eligible for deletion, but a normal disconnect must keep
  // the user's downloaded library intact. After this clear the
  // prune only acts on placeholders (which have no local content).
  await clearLastSeenOnSource();

  // No remaining source after disconnect (single-location model), so
  // every placeholder is unreachable. The empty reachable set drops
  // them all in one pass.
  const pruned = await pruneUnreachablePlaceholders(new Set<string>());
  if (pruned > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * Wipe just the library — books, bookmarks, statistics, reading
 * goals, last-item bookmark, plus the localStorage reading-goal hint
 * (since that pairs with the readingGoal IDB store). App settings,
 * themes, custom OAuth credentials, and reader prefs survive — use
 * the heavier "Sign out and wipe local data" action for a full reset.
 */
async function wipeLibraryContents(): Promise<void> {
  const db = await database.db;
  const tx = db.transaction(
    ['data', 'bookmark', 'statistic', 'lastModified', 'readingGoal', 'lastItem'],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('data').clear(),
    tx.objectStore('bookmark').clear(),
    tx.objectStore('statistic').clear(),
    tx.objectStore('lastModified').clear(),
    tx.objectStore('readingGoal').clear(),
    tx.objectStore('lastItem').clear()
  ]);
  await tx.done;

  localStorage.removeItem('readingGoal');
  localStorage.removeItem('lastReadingGoalsModified');

  database.notifyDataListChanged();
}

/**
 * On app boot, reconcile syncState.location with
 * what's actually persisted in IndexedDB. Call once from the root
 * layout on mount.
 */
export async function loadConnectionsFromDb(): Promise<void> {
  const db = await database.db;
  const records = await db.getAll('storageSource');

  // Single-location model: at most one record should exist. Pick the
  // most-recently-modified and delete the rest as a defensive
  // cleanup (e.g., an older release left a dormant record alongside
  // the active one).
  if (!records.length) return;
  const active = records.reduce((a, b) =>
    (b.lastSourceModified ?? 0) > (a.lastSourceModified ?? 0) ? b : a
  );
  for (const r of records) {
    if (r.name !== active.name) {
      await database.deleteStorageSource(r);
    }
  }

  if (active.type === SyncEndpointType.GDRIVE || active.type === SyncEndpointType.ONEDRIVE) {
    syncState.location = {
      kind: 'cloud',
      provider: active.type,
      usesCustomCredentials: isCustomCloudName(active.name),
      connectedAt: active.lastSourceModified,
      lastSyncedAt: null,
      bookCount: null
    };
  } else if (
    active.type === SyncEndpointType.FS &&
    active.name === FS_SOURCE_NAME &&
    active.data &&
    typeof active.data === 'object' &&
    'fsPath' in active.data
  ) {
    const fsData = active.data as FsHandle;
    syncState.location = {
      kind: 'fs',
      path: fsData.fsPath,
      connectedAt: active.lastSourceModified,
      lastSyncedAt: null
    };
  }
}
