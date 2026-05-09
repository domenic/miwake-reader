import { StorageSourceDefault } from '$lib/data/storage/storage-types';

export interface FsHandle {
  directoryHandle: FileSystemDirectoryHandle;
  fsPath: string;
}

export interface RemoteContext {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  /**
   * OAuth token endpoint override. Custom-credential users on
   * tenant-pinned OneDrive (work/school, GovCloud) need to point
   * code-exchange and refresh at their tenant's authority URL rather
   * than the consumer endpoint. When undefined, the env-default for
   * the provider is used. See StorageOAuthManager.getAuthVariables.
   */
  tokenEndpoint?: string;
}

export function isAppDefault(name: string) {
  return (
    name === StorageSourceDefault.GDRIVE_DEFAULT || name === StorageSourceDefault.ONEDRIVE_DEFAULT
  );
}

export function isRemoteContext(data: FsHandle | RemoteContext): data is RemoteContext {
  return !!(data && 'clientId' in data && data.clientId);
}
