import { StorageKey } from '$lib/data/storage/storage-types';

import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import type { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import { BrowserStorageHandler } from '$lib/data/storage/handler/browser-handler';
import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
import { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import { MergeMode } from '$lib/data/merge-mode';
import { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';

let backupStorageHandler: BackupStorageHandler;
let browserStorageHandler: BrowserStorageHandler;
let gDriveStorageHandler: GDriveStorageHandler;
let oneDriveStorageHandler: OneDriveStorageHandler;
let fsStorageHandler: FilesystemStorageHandler;

export function getStorageHandler(
  window: Window,
  storageType: StorageKey.BACKUP,
  storageSourceName?: string,
  cacheStorageData?: boolean,
  saveBehavior?: ReplicationSaveBehavior,
  statisticsMergeMode?: MergeMode,
  readingGoalsMergeMode?: MergeMode,
  askForStorageUnlock?: boolean
): BackupStorageHandler;
export function getStorageHandler(
  window: Window,
  storageType: StorageKey.BROWSER,
  storageSourceName?: string,
  cacheStorageData?: boolean,
  saveBehavior?: ReplicationSaveBehavior,
  statisticsMergeMode?: MergeMode,
  readingGoalsMergeMode?: MergeMode,
  askForStorageUnlock?: boolean
): BrowserStorageHandler;
export function getStorageHandler(
  window: Window,
  storageType: StorageKey.GDRIVE,
  storageSourceName?: string,
  cacheStorageData?: boolean,
  saveBehavior?: ReplicationSaveBehavior,
  statisticsMergeMode?: MergeMode,
  readingGoalsMergeMode?: MergeMode,
  askForStorageUnlock?: boolean
): GDriveStorageHandler;
export function getStorageHandler(
  window: Window,
  storageType: StorageKey.ONEDRIVE,
  storageSourceName?: string,
  cacheStorageData?: boolean,
  saveBehavior?: ReplicationSaveBehavior,
  statisticsMergeMode?: MergeMode,
  readingGoalsMergeMode?: MergeMode,
  askForStorageUnlock?: boolean
): OneDriveStorageHandler;
export function getStorageHandler(
  window: Window,
  storageType: StorageKey.FS,
  storageSourceName?: string,
  cacheStorageData?: boolean,
  saveBehavior?: ReplicationSaveBehavior,
  statisticsMergeMode?: MergeMode,
  readingGoalsMergeMode?: MergeMode,
  askForStorageUnlock?: boolean
): FilesystemStorageHandler;
export function getStorageHandler(
  window: Window,
  storageType: StorageKey,
  storageSourceName?: string,
  cacheStorageData?: boolean,
  saveBehavior?: ReplicationSaveBehavior,
  statisticsMergeMode?: MergeMode,
  readingGoalsMergeMode?: MergeMode,
  askForStorageUnlock?: boolean
): BaseStorageHandler;
export function getStorageHandler(
  window: Window,
  storageType: StorageKey,
  storageSourceName = '',
  cacheStorageData = false,
  saveBehavior = ReplicationSaveBehavior.NewOnly,
  statisticsMergeMode = MergeMode.MERGE,
  readingGoalsMergeMode = MergeMode.MERGE,
  askForStorageUnlock = true
) {
  switch (storageType) {
    case StorageKey.BACKUP:
      backupStorageHandler =
        backupStorageHandler || new BackupStorageHandler(window, StorageKey.BACKUP);
      backupStorageHandler.updateSettings(
        window,
        saveBehavior,
        statisticsMergeMode,
        readingGoalsMergeMode
      );

      return backupStorageHandler;
    case StorageKey.BROWSER:
      browserStorageHandler =
        browserStorageHandler || new BrowserStorageHandler(window, StorageKey.BROWSER);
      browserStorageHandler.updateSettings(
        window,
        saveBehavior,
        statisticsMergeMode,
        readingGoalsMergeMode
      );

      return browserStorageHandler;
    case StorageKey.GDRIVE:
      gDriveStorageHandler = gDriveStorageHandler || new GDriveStorageHandler(window);
      gDriveStorageHandler.updateSettings(
        window,
        saveBehavior,
        statisticsMergeMode,
        readingGoalsMergeMode,
        cacheStorageData,
        askForStorageUnlock,
        storageSourceName
      );

      return gDriveStorageHandler;
    case StorageKey.ONEDRIVE:
      oneDriveStorageHandler = oneDriveStorageHandler || new OneDriveStorageHandler(window);
      oneDriveStorageHandler.updateSettings(
        window,
        saveBehavior,
        statisticsMergeMode,
        readingGoalsMergeMode,
        cacheStorageData,
        askForStorageUnlock,
        storageSourceName
      );

      return oneDriveStorageHandler;
    case StorageKey.FS:
      fsStorageHandler = fsStorageHandler || new FilesystemStorageHandler(window, StorageKey.FS);
      fsStorageHandler.updateSettings(
        window,
        saveBehavior,
        statisticsMergeMode,
        readingGoalsMergeMode,
        cacheStorageData,
        askForStorageUnlock,
        storageSourceName
      );

      return fsStorageHandler;
    default:
      throw new Error(`No handler implementation for ${storageType}`);
  }
}
