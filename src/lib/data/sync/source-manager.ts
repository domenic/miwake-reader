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
  detachSourceKeepingLibrary,
  reconcileAfterAuthoritativeListing
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

/**
 * Generate a fresh `sourceInstanceId` for a newly-committed source.
 * Every successful connect rotates this so previously-mirrored book
 * rows whose `lastSeenSourceInstanceId` matches the prior id are
 * naturally inert: the post-connect boot push re-stamps them with
 * the new id where appropriate, and the cross-device-deletion prune
 * only acts on rows whose id matches the current source.
 */
function newSourceInstanceId(): string {
  return crypto.randomUUID();
}

async function completeFsConnection(
  directoryHandle: FileSystemDirectoryHandle,
  opts: CompleteOptions
): Promise<void> {
  const fsPath = directoryHandle.name;
  const sourceInstanceId = newSourceInstanceId();

  const data: FsHandle = { directoryHandle, fsPath };
  const record: BooksDbStorageSource = {
    name: FS_SOURCE_NAME,
    type: SyncEndpointType.FS,
    data,
    lastSourceModified: Date.now(),
    sourceInstanceId
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

  const now = Date.now();
  syncState.location = {
    kind: 'fs',
    path: fsPath,
    connectedAt: now,
    // The booklist + placeholder seed counts as a successful sync.
    lastSyncedAt: now,
    sourceInstanceId
  };
  syncState.health = { status: 'ok' };

  // Install the new active source BEFORE reconcile so the reconciler's
  // active-source guard sees the right id. The new id is fresh, so any
  // pre-existing book rows whose lastSeenSourceInstanceId references
  // the prior source are inert here — they survive this reconcile,
  // and the boot push below re-stamps them.
  await reconcileAfterAuthoritativeListing(books, sourceInstanceId);

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
    const sourceInstanceId = newSourceInstanceId();

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
      lastSourceModified: Date.now(),
      sourceInstanceId
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

    const now = Date.now();
    syncState.location = {
      kind: 'cloud',
      provider,
      usesCustomCredentials: useCustom,
      connectedAt: now,
      lastSyncedAt: now,
      bookCount: books.length,
      sourceInstanceId
    };
    syncState.health = { status: 'ok' };

    // See completeFsConnection for the install-before-reconcile rationale.
    await reconcileAfterAuthoritativeListing(books, sourceInstanceId);

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
 *
 * The prior source's `sourceInstanceId` becomes naturally inert via
 * id-mismatch (a fresh id is generated for the new connect), so no
 * row-by-row flag clearing is needed.
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
 * Tear down whatever sync location is currently configured. Idempotent
 * if nothing is connected. Drops in-memory OAuth tokens (for cloud) so
 * a same-tab reconnect re-runs the popup, deletes the IDB storageSource
 * record, drops placeholder rows (their source is gone), and clears
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

  // Source gone → drop placeholders (their content lives only on the
  // source) but keep the user's downloaded library. Downloaded books'
  // `lastSeenSourceInstanceId` is now invariant relative to any
  // future source: a later connect generates a fresh id, and the
  // reconcile against that new source treats those rows as
  // "different source, leave alone" until the boot push re-stamps
  // them.
  await detachSourceKeepingLibrary();
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
 * On app boot, reconcile syncState.location with what's actually
 * persisted in IndexedDB. Call once from the root layout on mount.
 *
 * Also runs a one-time backfill for the `sourceInstanceId` schema
 * additions: any storageSource record lacking a `sourceInstanceId`
 * gets one generated, and any book row carrying the legacy
 * `lastSeenOnSource` (pre-refactor) field has it migrated to
 * `lastSeenSourceInstanceId` matching the active source's new id.
 * This is idempotent — once a record / row has the new fields the
 * backfill is a no-op.
 */
export async function loadConnectionsFromDb(): Promise<void> {
  const db = await database.db;
  const records = await db.getAll('storageSource');

  // Single-location model: at most one record should exist. Pick the
  // most-recently-modified and delete the rest as a defensive
  // cleanup (e.g., an older release left a dormant record alongside
  // the active one).
  if (!records.length) {
    // No source ever connected: still drop any orphan legacy
    // lastSeenOnSource fields so book rows match the v7 schema.
    await migrateLegacyLastSeenOnSource(null);
    return;
  }
  const initialActive = records.reduce((a, b) =>
    (b.lastSourceModified ?? 0) > (a.lastSourceModified ?? 0) ? b : a
  );
  for (const r of records) {
    if (r.name !== initialActive.name) {
      await database.deleteStorageSource(r);
    }
  }

  // Backfill the active record's sourceInstanceId (a fresh UUID for
  // any record predating the per-source-identity refactor), then
  // migrate book rows carrying the legacy `lastSeenOnSource`
  // timestamp to `lastSeenSourceInstanceId` pointing at the active
  // id. Idempotent on subsequent boots.
  const sourceInstanceId = initialActive.sourceInstanceId ?? newSourceInstanceId();
  const active =
    initialActive.sourceInstanceId === sourceInstanceId
      ? initialActive
      : { ...initialActive, sourceInstanceId };
  if (initialActive !== active) {
    await database.saveStorageSource(active, active.name);
  }
  await migrateLegacyLastSeenOnSource(sourceInstanceId);

  if (active.type === SyncEndpointType.GDRIVE || active.type === SyncEndpointType.ONEDRIVE) {
    syncState.location = {
      kind: 'cloud',
      provider: active.type,
      usesCustomCredentials: isCustomCloudName(active.name),
      connectedAt: active.lastSourceModified,
      lastSyncedAt: null,
      bookCount: null,
      sourceInstanceId
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
      lastSyncedAt: null,
      sourceInstanceId
    };
  }
}

/**
 * Drop the legacy `lastSeenOnSource` field from every book row that
 * still carries it. When `activeSourceInstanceId` is non-null,
 * stamp `lastSeenSourceInstanceId` in its place so the row's
 * membership claim survives the schema migration; with no active
 * source there's nothing to point at, so just remove the legacy
 * field. Idempotent — rows already on the new shape are skipped.
 */
async function migrateLegacyLastSeenOnSource(activeSourceInstanceId: string | null): Promise<void> {
  const db = await database.db;
  const tx = db.transaction('data', 'readwrite');
  for await (const cursor of tx.store) {
    const row = cursor.value as typeof cursor.value & { lastSeenOnSource?: number };
    if (row.lastSeenOnSource === undefined) continue;
    const next = { ...row };
    delete next.lastSeenOnSource;
    if (activeSourceInstanceId !== null) {
      next.lastSeenSourceInstanceId = activeSourceInstanceId;
    }
    await cursor.update(next);
  }
  await tx.done;
}
