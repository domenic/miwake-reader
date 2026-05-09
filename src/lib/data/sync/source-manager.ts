import { gDriveClientId, oneDriveClientId, pagePath } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-types';
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
  opts: ConnectCloudOptions = {}
): Promise<void> {
  const current = syncState.location;
  const useCustom = opts.useCustomCredentials ?? !!readCustomCreds(provider);
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
   * Force the OAuth mode rather than deriving it from whether stored
   * custom creds exist. Used by revert-to-default, which keeps stored
   * custom creds for later but wants this connection to use the
   * default OAuth app.
   */
  useCustomCredentials?: boolean;
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

    const remoteData: RemoteContext =
      useCustom && customCreds
        ? {
            clientId: customCreds.clientId,
            clientSecret: customCreds.clientSecret,
            refreshToken: '',
            tokenEndpoint: customCreds.tokenEndpoint
          }
        : {
            clientId: provider === SyncEndpointType.GDRIVE ? gDriveClientId : oneDriveClientId,
            clientSecret: '',
            refreshToken: ''
          };

    const record: BooksDbStorageSource = {
      name,
      type: provider,
      data: remoteData,
      lastSourceModified: Date.now()
    };

    const existing = await (await database.db).get('storageSource', name);
    await database.saveStorageSource(record, existing ? name : '');

    // Drop the in-memory access token so authenticate() doesn't
    // short-circuit on a still-valid cached token: we just clobbered
    // the persisted refreshToken to '', and a silent success would
    // leave nothing for the next boot to refresh from.
    clearOAuthTokenCache(name);

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
    if (prev.kind === 'cloud') {
      const name = cloudSourceName(prev.provider, prev.usesCustomCredentials);
      clearOAuthTokenCache(name);
      const existing = await db.get('storageSource', name);
      if (existing) {
        await database.deleteStorageSource(existing);
      }
    } else {
      // Prior is FS, new is cloud. Drop the FS record; FS→FS replaces
      // in place via the same-name overwrite in completeFsConnection
      // and skips this teardown branch (priorLocation = null).
      const existing = await db.get('storageSource', FS_SOURCE_NAME);
      if (existing) {
        await database.deleteStorageSource(existing);
      }
    }
  }

  if (clearLibrary) {
    await wipeLibraryContents();
  }
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

  if (current.kind === 'cloud') {
    const name = cloudSourceName(current.provider, current.usesCustomCredentials);
    // Drop the in-memory access token so a same-tab reconnect actually
    // re-runs the OAuth popup; otherwise the manager would reuse the
    // still-valid cached token and never persist a new refresh_token.
    clearOAuthTokenCache(name);
    const existing = await db.get('storageSource', name);
    if (existing) {
      await database.deleteStorageSource(existing);
    }
  } else {
    const existing = await db.get('storageSource', FS_SOURCE_NAME);
    if (existing) {
      await database.deleteStorageSource(existing);
    }
  }

  syncState.location = null;
  syncState.health = { status: 'ok' };

  if (opts.clearLibrary) {
    await wipeLibraryContents();
    return;
  }

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

  // Cloud takes precedence: if both somehow exist (carried over from
  // pre-pivot installs), the cloud record wins and the FS record is
  // dropped. Disconnect/reconnect cycles maintain the at-most-one
  // invariant going forward.
  const cloudRecord = records.find(
    (r) => r.type === SyncEndpointType.GDRIVE || r.type === SyncEndpointType.ONEDRIVE
  );
  const fsRecord = records.find((r) => r.type === SyncEndpointType.FS && r.name === FS_SOURCE_NAME);

  if (cloudRecord) {
    syncState.location = {
      kind: 'cloud',
      provider: cloudRecord.type as CloudProviderType,
      usesCustomCredentials: isCustomCloudName(cloudRecord.name),
      connectedAt: cloudRecord.lastSourceModified,
      lastSyncedAt: null,
      bookCount: null
    };
    if (fsRecord) {
      // Stale FS record from a pre-pivot install — drop it.
      await db.delete('storageSource', FS_SOURCE_NAME);
    }
  } else if (
    fsRecord &&
    fsRecord.data &&
    typeof fsRecord.data === 'object' &&
    'fsPath' in fsRecord.data
  ) {
    const fsData = fsRecord.data as FsHandle;
    syncState.location = {
      kind: 'fs',
      path: fsData.fsPath,
      connectedAt: fsRecord.lastSourceModified,
      lastSyncedAt: null
    };
  }
}
