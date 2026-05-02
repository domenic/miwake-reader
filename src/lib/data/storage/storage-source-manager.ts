import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { StorageSourceDefault } from '$lib/data/storage/storage-types';

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

export function isAppDefault(name: string) {
  return (
    name === StorageSourceDefault.GDRIVE_DEFAULT || name === StorageSourceDefault.ONEDRIVE_DEFAULT
  );
}

export function isRemoteContext(
  data: FsHandle | ArrayBuffer | RemoteContext
): data is RemoteContext {
  return !!(data && 'clientId' in data && data.clientId);
}
