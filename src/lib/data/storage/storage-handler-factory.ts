import { SyncEndpointType } from '$lib/data/storage/storage-types';

import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
import { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import { LocalReplicationEndpoint } from '$lib/data/storage/handler/local-replication-endpoint';
import { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';

/**
 * Per-handler settings — fixed at construction. Per-scope settings
 * (save-behavior, merge-modes) live on `ScopedSettings`. The
 * silent-vs-interactive permission flag lives on the method calls
 * that can trigger a permission dialog (`listSyncTitles({silentOnly}),
 * `FilesystemStorageHandler.ensureRoot(askForStorageUnlock)`).
 */
interface SyncSettings {
  cacheStorageData?: boolean;
}

const defaults: Required<SyncSettings> = {
  cacheStorageData: false
};

// Memoize by the full configuration key. Two callers with the same
// (type, storageSourceName, cacheStorageData) share an instance —
// and therefore its warm listing caches. Two callers with different
// settings get distinct instances, each with its own cache, so
// neither trampling nor cache-cold-on-every-call.
const cache = new Map<
  string,
  BackupStorageHandler | GDriveStorageHandler | OneDriveStorageHandler | FilesystemStorageHandler
>();
let localEndpoint: LocalReplicationEndpoint | undefined;

function keyFor(
  type: SyncEndpointType,
  storageSourceName: string,
  cacheStorageData: boolean
): string {
  return `${type}|${storageSourceName}|${cacheStorageData ? 1 : 0}`;
}

/**
 * Get the singleton local replication endpoint. It holds no settings
 * (its only storage is IDB itself), so there's nothing to key on.
 */
export function getLocalEndpoint(): LocalReplicationEndpoint {
  localEndpoint ??= new LocalReplicationEndpoint();
  return localEndpoint;
}

/**
 * Get a sync endpoint for the given external location. Same
 * configuration → same instance (warm cache); changing the source
 * name or any setting hands you a freshly-constructed handler with a
 * cold cache (which is exactly what you want — the cache was tied to
 * the previous configuration).
 */
export function getSyncEndpoint(
  window: Window,
  storageType: SyncEndpointType.GDRIVE,
  storageSourceName: string,
  settings?: SyncSettings
): GDriveStorageHandler;
export function getSyncEndpoint(
  window: Window,
  storageType: SyncEndpointType.ONEDRIVE,
  storageSourceName: string,
  settings?: SyncSettings
): OneDriveStorageHandler;
export function getSyncEndpoint(
  window: Window,
  storageType: SyncEndpointType.FS,
  storageSourceName: string,
  settings?: SyncSettings
): FilesystemStorageHandler;
export function getSyncEndpoint(
  window: Window,
  storageType: SyncEndpointType.BACKUP,
  storageSourceName?: string,
  settings?: SyncSettings
): BackupStorageHandler;
export function getSyncEndpoint(
  window: Window,
  storageType: SyncEndpointType,
  storageSourceName = '',
  settings: SyncSettings = {}
) {
  const { cacheStorageData } = { ...defaults, ...settings };
  const key = keyFor(storageType, storageSourceName, cacheStorageData);
  const cached = cache.get(key);
  if (cached) return cached;

  let handler:
    | BackupStorageHandler
    | GDriveStorageHandler
    | OneDriveStorageHandler
    | FilesystemStorageHandler;
  switch (storageType) {
    case SyncEndpointType.BACKUP:
      handler = new BackupStorageHandler(window);
      break;
    case SyncEndpointType.GDRIVE:
      handler = new GDriveStorageHandler(window, storageSourceName, cacheStorageData);
      break;
    case SyncEndpointType.ONEDRIVE:
      handler = new OneDriveStorageHandler(window, storageSourceName, cacheStorageData);
      break;
    case SyncEndpointType.FS:
      handler = new FilesystemStorageHandler(window, storageSourceName, cacheStorageData);
      break;
    default:
      throw new Error(`No sync endpoint implementation for ${storageType}`);
  }
  cache.set(key, handler);
  return handler;
}
