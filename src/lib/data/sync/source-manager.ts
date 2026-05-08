import { gDriveClientId, oneDriveClientId, pagePath } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-manager';
import { clearOAuthTokenCache, StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
import { StorageKey } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import {
  cloudConnection$,
  cloudCustomCredentials$,
  cloudHealth$,
  fsConnection$,
  fsHealth$,
  type CloudConnectionState,
  type CloudProviderType,
  type CustomOAuthCredentials
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

/**
 * Connect (or reconnect) the filesystem slot by showing the native
 * directory picker, creating the app subdirectory inside it, and
 * persisting the handle. Caller handles AbortError (picker cancel).
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
    type: StorageKey.FS,
    data,
    lastSourceModified: Date.now()
  };

  const existing = await (await database.db).get('storageSource', FS_SOURCE_NAME);
  await database.saveStorageSource(record, existing ? FS_SOURCE_NAME : '');

  // Seed IndexedDB with placeholders for whatever's already in the
  // folder so /manage shows them under cloud icons; mirrors connectCloud.
  const handler = getSyncEndpoint(window, StorageKey.FS, FS_SOURCE_NAME);
  const books = await handler.listSyncTitles();
  const created = await ensurePlaceholders(books);
  if (created > 0) {
    database.notifyDataListChanged();
  }

  const now = Date.now();
  fsConnection$.next({
    path: fsPath,
    connectedAt: now,
    // The getBookList + placeholder seed IS a successful sync — record
    // it so the UI doesn't sit at "Not yet synced" until the first
    // ambient push.
    lastSyncedAt: now
  });
  fsHealth$.next({ status: 'ok' });

  // Mirror existing local content into the new folder. Ambient sync
  // only fires on local edits; without this, a fresh connect with an
  // empty folder would stay empty until the user happened to bookmark
  // something.
  await pushAllLocalBooks();
}

export async function disconnectFs(): Promise<void> {
  const db = await database.db;
  const existing = await db.get('storageSource', FS_SOURCE_NAME);
  if (existing) {
    await database.deleteStorageSource(existing);
    // Clear the connection subject BEFORE pruning so pruneAfterDisconnect
    // doesn't see this source as still connected and re-add its books to
    // the reachable set.
    fsConnection$.next(null);
    fsHealth$.next({ status: 'ok' });
    await pruneAfterDisconnect();
    return;
  }
  fsConnection$.next(null);
  fsHealth$.next({ status: 'ok' });
}

/**
 * Connect a cloud provider. Opens the OAuth popup _synchronously_ under
 * the caller's user-activation window (must be called directly from a
 * click handler, no prior awaits), writes the storage-source record,
 * drives OAuth through that pre-opened popup, then fetches the initial
 * book count. Rolls back on OAuth failure.
 *
 * Opening the popup up-front — rather than letting StorageOAuthManager
 * do it inside the deeply-async `getBookList()` call — sidesteps the
 * browser's popup blocker and the existing "popup blocked → messageDialog
 * → retry" fallback path, which has been observed producing PKCE
 * mismatches.
 */
export async function connectCloud(provider: CloudProviderType): Promise<void> {
  // Open the popup synchronously under the caller's user-activation so
  // the browser allows it. We navigate it to OAuth once the async DB
  // work is done — later navigations via location.assign inside
  // StorageOAuthManager don't need user activation. This sidesteps the
  // existing "popup blocked → messageDialog → retry" fallback path,
  // which has been observed producing PKCE mismatches.
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
          refreshToken: ''
        }
      : {
          clientId: provider === StorageKey.GDRIVE ? gDriveClientId : oneDriveClientId,
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

    const handler =
      provider === StorageKey.GDRIVE
        ? getSyncEndpoint(window, StorageKey.GDRIVE, name)
        : getSyncEndpoint(window, StorageKey.ONEDRIVE, name);

    try {
      await handler.authenticate(authWindow);
    } catch (err) {
      // OAuth failed — roll back the DB record.
      const db = await database.db;
      const stored = await db.get('storageSource', name);
      if (stored) {
        await database.deleteStorageSource(stored);
      }
      throw err;
    }

    // Token is cached now; this call won't re-open the popup.
    const books = await handler.listSyncTitles();

    // Seed IndexedDB with placeholders so /manage immediately shows
    // the user's remote library under cloud icons.
    const created = await ensurePlaceholders(books);
    if (created > 0) {
      database.notifyDataListChanged();
    }

    const now = Date.now();
    cloudConnection$.next({
      provider,
      usesCustomCredentials: useCustom,
      connectedAt: now,
      // The getBookList call above + placeholder seed IS a successful
      // sync — record it so the UI doesn't sit at "Not yet synced"
      // until the first ambient push.
      lastSyncedAt: now,
      bookCount: books.length
    });
    cloudHealth$.next({ status: 'ok' });

    // Mirror existing local content up to the cloud. Ambient sync
    // only fires on local edits; without this, a fresh connect into
    // an account with no overlap would stay empty until the user
    // happened to bookmark something.
    await pushAllLocalBooks();
  } finally {
    // Close the popup unconditionally. The auth-route page closes
    // itself after sendMessage(), but if getToken short-circuits on
    // an in-memory cached token (e.g., reconnect within the same
    // session), the popup never navigates and is left idling at
    // ?miwake-init-wait=1.
    if (!authWindow.closed) {
      authWindow.close();
    }
  }
}

export async function disconnectCloud(): Promise<void> {
  const current = read<CloudConnectionState | null>(cloudConnection$);
  if (current) {
    const name = cloudSourceName(current.provider, current.usesCustomCredentials);
    // Drop the in-memory access token so a same-tab reconnect actually
    // re-runs the OAuth popup; otherwise the manager would reuse the
    // still-valid cached token and never persist a new refresh_token
    // to the freshly-written storageSource record.
    clearOAuthTokenCache(name);
    const db = await database.db;
    const existing = await db.get('storageSource', name);
    if (existing) {
      await database.deleteStorageSource(existing);
      // Clear the connection subject BEFORE pruning so pruneAfterDisconnect
      // doesn't see this source as still connected and re-add its books to
      // the reachable set.
      cloudConnection$.next(null);
      cloudHealth$.next({ status: 'ok' });
      await pruneAfterDisconnect();
      return;
    }
  }
  cloudConnection$.next(null);
  cloudHealth$.next({ status: 'ok' });
}

/**
 * After dropping a source record, fetch the booklist from every
 * source still connected and prune any placeholder whose title isn't
 * present on at least one of them. Drives an atomic-feeling disconnect
 * UX: the library reflects the new reality the moment the disconnect
 * promise resolves, with no flicker through an inconsistent
 * intermediate state.
 *
 * If no source remains, all placeholders are pruned (their content is
 * unreachable). If a remaining source's booklist call fails, that
 * source contributes no titles to the reachable set — the conservative
 * choice would be to keep all placeholders, but that leaves dead rows;
 * the aggressive choice (treat as unreachable) is what we do. Users
 * will see "Sync failed" on the remaining source and can reconnect or
 * resync to recover.
 */
async function pruneAfterDisconnect(): Promise<void> {
  const reachableTitles = new Set<string>();

  const cloud = read<CloudConnectionState | null>(cloudConnection$);
  if (cloud) {
    try {
      const name = cloudSourceName(cloud.provider, cloud.usesCustomCredentials);
      const handler =
        cloud.provider === StorageKey.GDRIVE
          ? getSyncEndpoint(window, StorageKey.GDRIVE, name)
          : getSyncEndpoint(window, StorageKey.ONEDRIVE, name);
      await handler.authenticate(null, true);
      for (const book of await handler.listSyncTitles()) {
        reachableTitles.add(book.title);
      }
    } catch {
      // Source unreachable — treat as contributing no titles.
    }
  }

  const fs = read<{ path: string } | null>(fsConnection$);
  if (fs) {
    try {
      const handler = getSyncEndpoint(window, StorageKey.FS, FS_SOURCE_NAME);
      for (const book of await handler.listSyncTitles()) {
        reachableTitles.add(book.title);
      }
    } catch {
      // Source unreachable — treat as contributing no titles.
    }
  }

  const pruned = await pruneUnreachablePlaceholders(reachableTitles);
  if (pruned > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * On app boot, reconcile the new sync stores with what's actually
 * persisted in IndexedDB. Call once from the root layout on mount.
 */
export async function loadConnectionsFromDb(): Promise<void> {
  const db = await database.db;
  const records = await db.getAll('storageSource');

  const cloudRecord = records.find(
    (r) => r.type === StorageKey.GDRIVE || r.type === StorageKey.ONEDRIVE
  );
  const persistedCloud = read<CloudConnectionState | null>(cloudConnection$);
  if (cloudRecord) {
    cloudConnection$.next({
      provider: cloudRecord.type as CloudProviderType,
      usesCustomCredentials: isCustomCloudName(cloudRecord.name),
      connectedAt: cloudRecord.lastSourceModified,
      lastSyncedAt: persistedCloud?.lastSyncedAt ?? null,
      bookCount: persistedCloud?.bookCount ?? null
    });
    // Intentionally NO book-count refresh here: getBookList triggers the
    // OAuth manager, and if the cached refresh token is missing/invalid
    // the fallback popup path fires with no user gesture, which both
    // gets blocked and surfaces a "login to your cloud provider" dialog
    // on every page load. The count stays null until Phase 5's unified
    // /manage view sources it from the local library.
  } else if (persistedCloud) {
    // localStorage carries a hint from a previous device's backup but
    // there's no matching IndexedDB storageSource record (refresh
    // token), so we can't actually sync. Keep the connection visible
    // so the UI can prompt for reconnect instead of pretending sync
    // was never configured.
    cloudHealth$.next({
      status: 'reauth-required',
      summary: `Reconnect ${persistedCloud.provider === StorageKey.GDRIVE ? 'Google Drive' : 'OneDrive'}`,
      detail:
        'This device is missing the sign-in for the cloud account in your last backup. Reconnect to resume syncing.'
    });
  }
  // else: both empty — leave cloudConnection$ at its init-time null.
  // Calling .next(null) here would write the string "null" to
  // localStorage, which a subsequent "Keep newest" import would then
  // mistake for a user value worth preserving.

  const fsRecord = records.find((r) => r.type === StorageKey.FS && r.name === FS_SOURCE_NAME);
  if (fsRecord && fsRecord.data && typeof fsRecord.data === 'object' && 'fsPath' in fsRecord.data) {
    const fsData = fsRecord.data as FsHandle;
    fsConnection$.next({
      path: fsData.fsPath,
      connectedAt: fsRecord.lastSourceModified,
      lastSyncedAt: null
    });
  } else {
    fsConnection$.next(null);
  }
}
