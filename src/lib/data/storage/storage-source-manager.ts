import {
  StorageKey,
  StorageSourceDefault,
  internalStorageSourceName
} from '$lib/data/storage/storage-types';

import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import StorageUnlock from '$lib/components/storage-unlock.svelte';
import { dialogManager } from '$lib/data/dialog-manager';

export interface FsHandle {
  directoryHandle: FileSystemDirectoryHandle;
  fsPath: string;
}

export interface RemoteContext {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
}

export interface StorageSourceSaveResult {
  new: BooksDbStorageSource;
  old?: string;
}

/**
 * The redesign dropped per-source password encryption — every record
 * the new code writes has `encryptionDisabled: true`. What "unlocking"
 * means now: for cloud sources, return the stored RemoteContext as-is;
 * for filesystem sources where the saved handle has been revoked, show
 * a confirm-permission dialog so the user can re-grant inside a user
 * activation. No passwords involved.
 */
export type StorageUnlockAction = RemoteContext;

export function isAppDefault(name: string) {
  return (
    name === StorageSourceDefault.GDRIVE_DEFAULT ||
    name === StorageSourceDefault.ONEDRIVE_DEFAULT ||
    internalStorageSourceName.has(name)
  );
}

export async function unlockStorageData(
  storageSource: BooksDbStorageSource | undefined,
  unlockDescription: string,
  unlockProps?: Record<string, any>
) {
  let unlockResult: StorageUnlockAction | undefined;

  if (
    storageSource &&
    storageSource.type !== StorageKey.FS &&
    isRemoteContext(storageSource.data)
  ) {
    unlockResult = storageSource.data;
  }

  if (!unlockResult && unlockProps) {
    unlockResult = await new Promise<StorageUnlockAction | undefined>((resolver) => {
      dialogManager.dialogs$.next([
        {
          component: StorageUnlock,
          props: {
            ...unlockProps,
            description: unlockDescription,
            resolver
          },
          disableCloseOnClick: true
        }
      ]);
    });
  }

  return unlockResult;
}

export function isRemoteContext(
  data: FsHandle | ArrayBuffer | RemoteContext
): data is RemoteContext {
  return !!(data && 'clientId' in data && data.clientId);
}
