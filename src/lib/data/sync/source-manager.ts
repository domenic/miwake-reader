import { gDriveClientId, oneDriveClientId, pagePath } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-manager';
import { StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
import { StorageKey } from '$lib/data/storage/storage-types';
import {
  database,
  fsStorageSource$,
  gDriveStorageSource$,
  oneDriveStorageSource$,
  syncTarget$
} from '$lib/data/store';
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
import { ensurePlaceholders } from '$lib/data/sync/sync-engine';
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
    storedInManager: false,
    encryptionDisabled: true,
    lastSourceModified: Date.now()
  };

  const priorName = read<string>(fsStorageSource$);
  await database.saveStorageSource(
    record,
    priorName === FS_SOURCE_NAME ? priorName : '',
    false,
    true
  );

  fsConnection$.next({
    path: fsPath,
    connectedAt: Date.now(),
    lastSyncedAt: null
  });
  fsHealth$.next({ status: 'ok' });

  // If nothing else is set as the sync target, prefer FS so the existing
  // replication engine has something to push to.
  if (!read<string>(syncTarget$) && !read<object | null>(cloudConnection$)) {
    syncTarget$.next(FS_SOURCE_NAME);
  }
}

export async function disconnectFs(): Promise<void> {
  const db = await database.db;
  const existing = await db.get('storageSource', FS_SOURCE_NAME);
  if (existing) {
    await database.deleteStorageSource(
      existing,
      read<string>(syncTarget$) === FS_SOURCE_NAME,
      read<string>(fsStorageSource$) === FS_SOURCE_NAME
    );
    await pruneLocalPlaceholdersBySource(FS_SOURCE_NAME);
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

  let didSucceed = false;
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
      storedInManager: false,
      encryptionDisabled: true,
      lastSourceModified: Date.now()
    };

    const slotStore =
      provider === StorageKey.GDRIVE ? gDriveStorageSource$ : oneDriveStorageSource$;
    const priorName = read<string>(slotStore);
    await database.saveStorageSource(record, priorName === name ? priorName : '', true, true);

    const handler =
      provider === StorageKey.GDRIVE
        ? getStorageHandler(window, StorageKey.GDRIVE, name)
        : getStorageHandler(window, StorageKey.ONEDRIVE, name);

    try {
      await handler.authenticate(authWindow);
    } catch (err) {
      // OAuth failed — roll back the DB record.
      const db = await database.db;
      const existing = await db.get('storageSource', name);
      if (existing) {
        await database.deleteStorageSource(existing, true, true);
      }
      throw err;
    }

    // Token is cached now; this call won't re-open the popup.
    const books = await handler.getBookList();

    // Seed IndexedDB with placeholders so /manage immediately shows
    // the user's remote library under cloud icons.
    const created = await ensurePlaceholders(books, name);
    if (created > 0) {
      database.dataListChanged$.next(undefined);
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
    didSucceed = true;
  } finally {
    if (!didSucceed && !authWindow.closed) {
      authWindow.close();
    }
  }
}

export async function disconnectCloud(): Promise<void> {
  const current = read<CloudConnectionState | null>(cloudConnection$);
  if (current) {
    const name = cloudSourceName(current.provider, current.usesCustomCredentials);
    const db = await database.db;
    const existing = await db.get('storageSource', name);
    if (existing) {
      const slotStore =
        current.provider === StorageKey.GDRIVE ? gDriveStorageSource$ : oneDriveStorageSource$;
      await database.deleteStorageSource(
        existing,
        read<string>(syncTarget$) === name,
        read<string>(slotStore) === name
      );
    }
    // Delete any placeholder rows that pointed at this source — their
    // content is no longer reachable.
    await pruneLocalPlaceholdersBySource(name);
  }
  cloudConnection$.next(null);
  cloudHealth$.next({ status: 'ok' });
}

async function pruneLocalPlaceholdersBySource(sourceName: string): Promise<void> {
  const db = await database.db;
  const all = await db.getAll('data');
  for (const book of all) {
    if (!book.elementHtml && book.storageSource === sourceName) {
      await db.delete('data', book.id);
    }
  }
  database.dataListChanged$.next(undefined);
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
  if (cloudRecord) {
    cloudConnection$.next({
      provider: cloudRecord.type as CloudProviderType,
      usesCustomCredentials: isCustomCloudName(cloudRecord.name),
      connectedAt: cloudRecord.lastSourceModified,
      lastSyncedAt: null,
      bookCount: null
    });
    // Intentionally NO book-count refresh here: getBookList triggers the
    // OAuth manager, and if the cached refresh token is missing/invalid
    // the fallback popup path fires with no user gesture, which both
    // gets blocked and surfaces a "login to your cloud provider" dialog
    // on every page load. The count stays null until Phase 5's unified
    // /manage view sources it from the local library.
  } else {
    cloudConnection$.next(null);
  }

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

  // Keep the legacy sync-target / per-type-default stores in lockstep
  // with what the new UI considers connected. In the new model there's
  // no separate "sync target" concept — connected = syncs. Cloud wins
  // over FS as the primary when both are present.
  if (cloudRecord) {
    syncTarget$.next(cloudRecord.name);
    if (cloudRecord.type === StorageKey.GDRIVE) {
      gDriveStorageSource$.next(cloudRecord.name);
    } else {
      oneDriveStorageSource$.next(cloudRecord.name);
    }
  } else if (fsRecord) {
    syncTarget$.next(fsRecord.name);
  } else {
    syncTarget$.next('');
  }
  if (fsRecord) {
    fsStorageSource$.next(fsRecord.name);
  }
}
