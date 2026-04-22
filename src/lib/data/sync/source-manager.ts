import { gDriveClientId, oneDriveClientId } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-manager';
import { StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';
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
  type CloudProviderType,
  type CustomOAuthCredentials
} from '$lib/data/sync/sync-store';

/**
 * New-UI single-source-of-truth: at most one FS source and one cloud
 * source can exist in IndexedDB at any time. These sentinel names pin
 * each slot.
 */
const FS_SOURCE_NAME = 'miwake-fs';

/**
 * When connecting a cloud provider, we reuse the existing pre-configured
 * default sentinel for the miwake-default OAuth case (so
 * `StorageOAuthManager` picks up the env.ts client credentials) or a
 * parallel `*-custom` name for user-supplied credentials.
 */
function cloudSourceName(provider: CloudProviderType, custom: boolean): string {
  if (provider === StorageKey.GDRIVE) {
    return custom ? 'miwake-gdrive-custom' : StorageSourceDefault.GDRIVE_DEFAULT;
  }
  return custom ? 'miwake-onedrive-custom' : StorageSourceDefault.ONEDRIVE_DEFAULT;
}

function providerLabelFor(provider: CloudProviderType): string {
  return provider === StorageKey.GDRIVE ? 'Google Drive' : 'OneDrive';
}

function isCustomCloudName(name: string): boolean {
  return name === 'miwake-gdrive-custom' || name === 'miwake-onedrive-custom';
}

// `*$` stores in this codebase are BehaviorSubjects with `.getValue()`
// and `.next()`. TypeScript's exports don't expose `.getValue()`
// (they're typed as the wider writable interface) so we cast at the
// call sites.
type Readable<T> = { getValue(): T };

function read<T>(subject: unknown): T {
  return (subject as Readable<T>).getValue();
}

/**
 * Connect (or reconnect) the filesystem slot by showing the native
 * directory picker, creating the app subdirectory inside it, and
 * persisting the handle. Caller handles AbortError (picker cancel).
 */
export async function connectFs(): Promise<void> {
  const parentHandle = await window.showDirectoryPicker({
    id: 'miwake-reader-root',
    mode: 'readwrite'
  });
  const rootHandle = await parentHandle.getDirectoryHandle(BaseStorageHandler.rootName, {
    create: true
  });
  const fsPath = `${parentHandle.name === '\\' ? '' : `${parentHandle.name}/`}${
    BaseStorageHandler.rootName
  }`;

  const data: FsHandle = { directoryHandle: rootHandle, fsPath };
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
    lastSyncedAt: Date.now()
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
  }
  fsConnection$.next(null);
  fsHealth$.next({ status: 'ok' });
}

/**
 * Connect a cloud provider. Writes the storage-source record, sets the
 * relevant per-type default store, then forces OAuth by asking the
 * handler to list books (which triggers lazy token acquisition inside
 * `StorageOAuthManager`, opening the popup and persisting the refresh
 * token back into the same record). Rolls back on failure.
 */
export async function connectCloud(provider: CloudProviderType): Promise<void> {
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

  const slotStore = provider === StorageKey.GDRIVE ? gDriveStorageSource$ : oneDriveStorageSource$;
  const priorName = read<string>(slotStore);
  await database.saveStorageSource(record, priorName === name ? priorName : '', true, true);

  // Force OAuth by doing a trivial API call. The popup opens, the user
  // signs in, and on success the refresh token is written into the same
  // record by StorageOAuthManager.
  let bookCount: number;
  try {
    const handler = getStorageHandler(window, provider, name);
    const books = await handler.getBookList();
    bookCount = books.length;
  } catch (err) {
    // Roll back on failure so the UI doesn't show a phantom connection.
    const db = await database.db;
    const existing = await db.get('storageSource', name);
    if (existing) {
      await database.deleteStorageSource(existing, true, true);
    }
    throw err;
  }

  cloudConnection$.next({
    provider,
    accountLabel: providerLabelFor(provider),
    usesCustomCredentials: useCustom,
    connectedAt: Date.now(),
    lastSyncedAt: Date.now(),
    bookCount
  });
  cloudHealth$.next({ status: 'ok' });
}

export async function disconnectCloud(): Promise<void> {
  const current = read<{ provider: CloudProviderType; usesCustomCredentials: boolean } | null>(
    cloudConnection$
  );
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
  }
  cloudConnection$.next(null);
  cloudHealth$.next({ status: 'ok' });
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
      accountLabel: providerLabelFor(cloudRecord.type as CloudProviderType),
      usesCustomCredentials: isCustomCloudName(cloudRecord.name),
      connectedAt: cloudRecord.lastSourceModified,
      lastSyncedAt: cloudRecord.lastSourceModified,
      bookCount: 0
    });
  } else {
    cloudConnection$.next(null);
  }

  const fsRecord = records.find((r) => r.type === StorageKey.FS && r.name === FS_SOURCE_NAME);
  if (fsRecord && fsRecord.data && typeof fsRecord.data === 'object' && 'fsPath' in fsRecord.data) {
    const fsData = fsRecord.data as FsHandle;
    fsConnection$.next({
      path: fsData.fsPath,
      connectedAt: fsRecord.lastSourceModified,
      lastSyncedAt: fsRecord.lastSourceModified
    });
  } else {
    fsConnection$.next(null);
  }
}
