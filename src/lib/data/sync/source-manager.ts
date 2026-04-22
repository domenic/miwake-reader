import { gDriveClientId, oneDriveClientId, pagePath } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-manager';
import { StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
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
  type CloudConnectionState,
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

    cloudConnection$.next({
      provider,
      usesCustomCredentials: useCustom,
      connectedAt: Date.now(),
      lastSyncedAt: null,
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

/**
 * Best-effort refresh of the cloud book count by asking the handler
 * for the current book list. Updates `cloudConnection$.bookCount` on
 * success; silently leaves the previous value on failure. Called on
 * boot (from `loadConnectionsFromDb`) so the UI reflects the remote
 * library size rather than a stale snapshot from the last connect.
 */
async function refreshCloudBookCount(): Promise<void> {
  const current = read<CloudConnectionState | null>(cloudConnection$);
  if (!current) return;

  const name = cloudSourceName(current.provider, current.usesCustomCredentials);
  try {
    const handler =
      current.provider === StorageKey.GDRIVE
        ? getStorageHandler(window, StorageKey.GDRIVE, name)
        : getStorageHandler(window, StorageKey.ONEDRIVE, name);
    const books = await handler.getBookList();
    const latest = read<CloudConnectionState | null>(cloudConnection$);
    if (!latest) return;
    cloudConnection$.next({ ...latest, bookCount: books.length });
  } catch {
    // Leave bookCount at whatever it was. A failure here is almost
    // certainly an auth/network issue that the user will see surface
    // via the sync status indicator separately.
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
      usesCustomCredentials: isCustomCloudName(cloudRecord.name),
      connectedAt: cloudRecord.lastSourceModified,
      lastSyncedAt: null,
      bookCount: null
    });
    // Fire-and-forget refresh; UI shows a placeholder until it resolves.
    refreshCloudBookCount();
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
