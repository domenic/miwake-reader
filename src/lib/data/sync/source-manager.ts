import { gDriveClientId, oneDriveClientId, pagePath } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-manager';
import { clearOAuthTokenCache, StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import {
  cloudCustomCredentials$,
  lastCloudHint$,
  syncHealth$,
  syncLocation$,
  type CloudProviderType,
  type CustomOAuthCredentials,
  type SyncLocation
} from '$lib/data/sync/sync-store';
import {
  ensurePlaceholders,
  pruneUnreachablePlaceholders,
  pushAllLocalBooks
} from '$lib/data/sync/sync-engine';
import {
  cloudSourceName,
  FS_SOURCE_NAME,
  isCustomCloudName,
  readSubject as read
} from '$lib/data/sync/sync-helpers';

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
 * Replace whatever sync location is currently set with a new one.
 * If a different location is already configured, disconnect it first
 * — at most one is connected at a time.
 *
 * Caller is responsible for confirming the destructive switch with
 * the user; this function just executes.
 */
export async function switchToCloud(
  provider: CloudProviderType,
  opts: LeaveOptions = {}
): Promise<void> {
  const current = read<SyncLocation | null>(syncLocation$);
  if (current && (current.kind !== 'cloud' || current.provider !== provider)) {
    await disconnect(opts);
  }
  await connectCloud(provider);
}

export async function switchToFs(opts: LeaveOptions = {}): Promise<void> {
  const current = read<SyncLocation | null>(syncLocation$);
  if (current && current.kind !== 'fs') {
    await disconnect(opts);
  }
  await connectFs();
}

/**
 * Connect a local folder by showing the native directory picker,
 * persisting the handle, and seeding placeholders for whatever's
 * already inside. Caller handles AbortError (picker cancel).
 */
export async function connectFs(): Promise<void> {
  const directoryHandle = await window.showDirectoryPicker({
    id: 'miwake-reader-root',
    mode: 'readwrite'
  });
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

  const handler = getSyncEndpoint(window, SyncEndpointType.FS, FS_SOURCE_NAME);
  const books = await handler.listSyncTitles();
  const created = await ensurePlaceholders(books);
  if (created > 0) {
    database.notifyDataListChanged();
  }

  const now = Date.now();
  syncLocation$.next({
    kind: 'fs',
    path: fsPath,
    connectedAt: now,
    // The booklist + placeholder seed counts as a successful sync.
    lastSyncedAt: now
  });
  syncHealth$.next({ status: 'ok' });

  // Mirror existing local content into the new folder. Ambient sync
  // only fires on local edits; without this, a fresh connect with an
  // empty folder would stay empty until the user happened to bookmark
  // something.
  await pushAllLocalBooks();
}

/**
 * Connect a cloud provider. Opens the OAuth popup _synchronously_ under
 * the caller's user-activation window (must be called directly from a
 * click handler, no prior awaits), writes the storage-source record,
 * drives OAuth through that pre-opened popup, then fetches the initial
 * book count. Rolls back on OAuth failure.
 *
 * Opening the popup up-front — rather than letting StorageOAuthManager
 * do it inside the deeply-async listSyncTitles call — sidesteps the
 * browser's popup blocker and the existing "popup blocked → messageDialog
 * → retry" fallback path, which has been observed producing PKCE
 * mismatches.
 */
export async function connectCloud(provider: CloudProviderType): Promise<void> {
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

  try {
    const customCreds =
      read<Partial<Record<CloudProviderType, CustomOAuthCredentials>>>(cloudCustomCredentials$)[
        provider
      ];
    const useCustom = !!customCreds;
    const name = cloudSourceName(provider, useCustom);

    const remoteData: RemoteContext = useCustom
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

    // Clear any in-memory access token so authenticate() doesn't
    // short-circuit on a still-valid cached access token while the
    // persisted refreshToken we just wrote is empty — the user would
    // appear connected for the rest of the session and then have no
    // way to refresh on the next boot.
    clearOAuthTokenCache(name);

    const handler =
      provider === SyncEndpointType.GDRIVE
        ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, name)
        : getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, name);

    try {
      await handler.authenticate(authWindow);
    } catch (err) {
      // OAuth failed — restore prior state. If a record existed
      // before, put it back: we just clobbered its refreshToken with
      // an empty string, so a naive delete-on-failure would leave the
      // user permanently signed out instead of merely failing this
      // attempt. If there was no prior record, drop the placeholder
      // we wrote.
      if (existing) {
        await database.saveStorageSource(existing, name);
      } else {
        const db = await database.db;
        const stored = await db.get('storageSource', name);
        if (stored) await database.deleteStorageSource(stored);
      }
      throw err;
    }

    // Token is cached now; this call won't re-open the popup.
    const books = await handler.listSyncTitles();
    const created = await ensurePlaceholders(books);
    if (created > 0) {
      database.notifyDataListChanged();
    }

    const now = Date.now();
    syncLocation$.next({
      kind: 'cloud',
      provider,
      usesCustomCredentials: useCustom,
      connectedAt: now,
      lastSyncedAt: now,
      bookCount: books.length
    });
    syncHealth$.next({ status: 'ok' });
    lastCloudHint$.next({ provider, usesCustomCredentials: useCustom });

    await pushAllLocalBooks();
  } finally {
    if (!authWindow.closed) {
      authWindow.close();
    }
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
  const current = read<SyncLocation | null>(syncLocation$);
  if (!current) {
    syncLocation$.next(null);
    syncHealth$.next({ status: 'ok' });
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

  syncLocation$.next(null);
  syncHealth$.next({ status: 'ok' });

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
 * On app boot, reconcile the syncLocation$ runtime subject with
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
    syncLocation$.next({
      kind: 'cloud',
      provider: cloudRecord.type as CloudProviderType,
      usesCustomCredentials: isCustomCloudName(cloudRecord.name),
      connectedAt: cloudRecord.lastSourceModified,
      lastSyncedAt: null,
      bookCount: null
    });
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
    syncLocation$.next({
      kind: 'fs',
      path: fsData.fsPath,
      connectedAt: fsRecord.lastSourceModified,
      lastSyncedAt: null
    });
  } else {
    // No IDB record. If we have a cross-device cloud hint from
    // app-settings backup, surface a reconnect prompt.
    const hint = read<{ provider: CloudProviderType; usesCustomCredentials: boolean } | null>(
      lastCloudHint$
    );
    if (hint) {
      syncHealth$.next({
        status: 'reauth-required',
        summary: `Reconnect ${hint.provider === SyncEndpointType.GDRIVE ? 'Google Drive' : 'OneDrive'}`,
        detail:
          'This device is missing the sign-in for the cloud account in your last backup. Reconnect to resume syncing.'
      });
    }
  }
}
