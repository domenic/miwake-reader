import { SyncEndpointType } from '$lib/data/storage/storage-types';

import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
import { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import { LocalReplicationEndpoint } from '$lib/data/storage/handler/local-replication-endpoint';
import { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';

let localEndpoint: LocalReplicationEndpoint;
let backupHandler: BackupStorageHandler;
let gDriveHandler: GDriveStorageHandler;
let oneDriveHandler: OneDriveStorageHandler;
let fsHandler: FilesystemStorageHandler;

/**
 * Per-handler settings: things that vary per-source over the
 * handler's lifetime. Per-scope save-behavior and merge-modes live on
 * the `ScopedSettings` passed to `handler.scoped(...)` — they do
 * NOT belong here.
 */
interface SyncSettings {
  cacheStorageData?: boolean;
  askForStorageUnlock?: boolean;
}

const defaults: Required<SyncSettings> = {
  cacheStorageData: false,
  askForStorageUnlock: true
};

/**
 * Get the singleton local replication endpoint — the BookOperations
 * adapter the replicator uses for its local side. Per-scope settings
 * (save-behavior, merge-modes) are applied at `local.scoped(...)`
 * time, not here.
 *
 * Not user-facing. UI code should reach through `$lib/data/library`
 * instead — that module pairs each edit with the appropriate
 * triggerSync call.
 */
export function getLocalEndpoint(settings: SyncSettings = {}): LocalReplicationEndpoint {
  const merged = { ...defaults, ...settings };
  localEndpoint = localEndpoint ?? new LocalReplicationEndpoint();
  localEndpoint.updateSettings(merged.cacheStorageData);
  return localEndpoint;
}

/**
 * Get a sync endpoint for the given external location. The local
 * endpoint is fetched via getLocalEndpoint() — it's not a sync endpoint.
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
  const merged = { ...defaults, ...settings };
  switch (storageType) {
    case SyncEndpointType.BACKUP:
      backupHandler = backupHandler ?? new BackupStorageHandler(window, SyncEndpointType.BACKUP);
      backupHandler.updateSettings(window);
      return backupHandler;
    case SyncEndpointType.GDRIVE:
      gDriveHandler = gDriveHandler ?? new GDriveStorageHandler(window);
      gDriveHandler.updateSettings(
        window,
        merged.cacheStorageData,
        merged.askForStorageUnlock,
        storageSourceName
      );
      return gDriveHandler;
    case SyncEndpointType.ONEDRIVE:
      oneDriveHandler = oneDriveHandler ?? new OneDriveStorageHandler(window);
      oneDriveHandler.updateSettings(
        window,
        merged.cacheStorageData,
        merged.askForStorageUnlock,
        storageSourceName
      );
      return oneDriveHandler;
    case SyncEndpointType.FS:
      fsHandler = fsHandler ?? new FilesystemStorageHandler(window, SyncEndpointType.FS);
      fsHandler.updateSettings(
        window,
        merged.cacheStorageData,
        merged.askForStorageUnlock,
        storageSourceName
      );
      return fsHandler;
    default:
      throw new Error(`No sync endpoint implementation for ${storageType}`);
  }
}
