import { SyncEndpointType } from '$lib/data/storage/storage-types';

import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
import { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import { LocalReplicationEndpoint } from '$lib/data/storage/handler/local-replication-endpoint';
import type { MergeMode } from '$lib/data/merge-mode';
import { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';

let localEndpoint: LocalReplicationEndpoint;
let backupHandler: BackupStorageHandler;
let gDriveHandler: GDriveStorageHandler;
let oneDriveHandler: OneDriveStorageHandler;
let fsHandler: FilesystemStorageHandler;

interface SyncSettings {
  saveBehavior?: ReplicationSaveBehavior;
  statisticsMergeMode?: MergeMode;
  readingGoalsMergeMode?: MergeMode;
  cacheStorageData?: boolean;
  askForStorageUnlock?: boolean;
}

const defaults: Required<SyncSettings> = {
  saveBehavior: ReplicationSaveBehavior.NewOnly,
  statisticsMergeMode: 'merge',
  readingGoalsMergeMode: 'merge',
  cacheStorageData: false,
  askForStorageUnlock: true
};

/**
 * Get the singleton local replication endpoint — the BookOperations
 * adapter the replicator uses for its local side. Settings are
 * applied on every call; pass overrides if needed (e.g.
 * saveBehavior=Overwrite for the push leg of force-resync's
 * local-wins direction).
 *
 * Not user-facing. UI code should reach through `$lib/data/library`
 * instead — that module pairs each edit with the appropriate
 * triggerSync call.
 */
export function getLocalEndpoint(settings: SyncSettings = {}): LocalReplicationEndpoint {
  const merged = { ...defaults, ...settings };
  localEndpoint = localEndpoint ?? new LocalReplicationEndpoint();
  localEndpoint.updateSettings(
    merged.saveBehavior,
    merged.statisticsMergeMode,
    merged.readingGoalsMergeMode,
    merged.cacheStorageData
  );
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
      backupHandler.updateSettings(
        window,
        merged.saveBehavior,
        merged.statisticsMergeMode,
        merged.readingGoalsMergeMode
      );
      return backupHandler;
    case SyncEndpointType.GDRIVE:
      gDriveHandler = gDriveHandler ?? new GDriveStorageHandler(window);
      gDriveHandler.updateSettings(
        window,
        merged.saveBehavior,
        merged.statisticsMergeMode,
        merged.readingGoalsMergeMode,
        merged.cacheStorageData,
        merged.askForStorageUnlock,
        storageSourceName
      );
      return gDriveHandler;
    case SyncEndpointType.ONEDRIVE:
      oneDriveHandler = oneDriveHandler ?? new OneDriveStorageHandler(window);
      oneDriveHandler.updateSettings(
        window,
        merged.saveBehavior,
        merged.statisticsMergeMode,
        merged.readingGoalsMergeMode,
        merged.cacheStorageData,
        merged.askForStorageUnlock,
        storageSourceName
      );
      return oneDriveHandler;
    case SyncEndpointType.FS:
      fsHandler = fsHandler ?? new FilesystemStorageHandler(window, SyncEndpointType.FS);
      fsHandler.updateSettings(
        window,
        merged.saveBehavior,
        merged.statisticsMergeMode,
        merged.readingGoalsMergeMode,
        merged.cacheStorageData,
        merged.askForStorageUnlock,
        storageSourceName
      );
      return fsHandler;
    default:
      throw new Error(`No sync endpoint implementation for ${storageType}`);
  }
}
