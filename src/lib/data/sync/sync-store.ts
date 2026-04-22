import { writableObjectLocalStorageSubject } from '$lib/data/internal/writable-object-local-storage-subject';
import { StorageKey } from '$lib/data/storage/storage-types';

export type CloudProviderType = StorageKey.GDRIVE | StorageKey.ONEDRIVE;

export interface CloudConnectionState {
  provider: CloudProviderType;
  usesCustomCredentials: boolean;
  connectedAt: number;
  /**
   * Timestamp of the most recent successful sync touching this source,
   * or `null` if nothing has synced since the connection was made.
   * Phase 4's ambient sync engine is responsible for updating this;
   * pre-Phase-4 it stays `null` after connect.
   */
  lastSyncedAt: number | null;
  /**
   * Number of books at the remote source as of the last fetch (connect,
   * app boot, or explicit refresh). `null` until first fetched.
   * Expected to become derived from /manage's unified library view in
   * Phase 5, at which point this field goes away.
   */
  bookCount: number | null;
}

export interface FsConnectionState {
  path: string;
  connectedAt: number;
  lastSyncedAt: number | null;
}

export interface CustomOAuthCredentials {
  clientId: string;
  clientSecret: string;
  tokenEndpoint?: string;
}

export type SyncLocationHealth =
  | { status: 'ok' }
  | { status: 'reauth-required'; summary: string; detail?: string }
  | { status: 'permission-required'; summary: string; detail?: string }
  | {
      status: 'error';
      summary: string;
      detail?: string;
      technicalDetail?: string;
    };

export const cloudConnection$ = writableObjectLocalStorageSubject<CloudConnectionState | null>()(
  'sync.cloudConnection',
  null
);

export const fsConnection$ = writableObjectLocalStorageSubject<FsConnectionState | null>()(
  'sync.fsConnection',
  null
);

export const cloudCustomCredentials$ = writableObjectLocalStorageSubject<
  Partial<Record<CloudProviderType, CustomOAuthCredentials>>
>()('sync.cloudCustomCredentials', {});

export const cloudHealth$ = writableObjectLocalStorageSubject<SyncLocationHealth>()(
  'sync.cloudHealth',
  {
    status: 'ok'
  }
);

export const fsHealth$ = writableObjectLocalStorageSubject<SyncLocationHealth>()('sync.fsHealth', {
  status: 'ok'
});
