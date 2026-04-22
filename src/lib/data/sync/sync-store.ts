import { writableStringLocalStorageSubject } from '$lib/data/internal/writable-string-local-storage-subject';
import { writableObjectLocalStorageSubject } from '$lib/data/internal/writable-object-local-storage-subject';
import { StorageKey } from '$lib/data/storage/storage-types';
import { MergeMode } from '$lib/data/merge-mode';
import { AutoReplicationType } from '$lib/functions/replication/replication-options';

export type CloudProviderType = StorageKey.GDRIVE | StorageKey.ONEDRIVE;

export interface CloudConnectionState {
  provider: CloudProviderType;
  accountLabel: string;
  usesCustomCredentials: boolean;
  connectedAt: number;
  lastSyncedAt: number;
  bookCount: number;
}

export interface FsConnectionState {
  path: string;
  connectedAt: number;
  lastSyncedAt: number;
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

export const syncDirection$ = writableStringLocalStorageSubject<AutoReplicationType>()(
  'sync.direction',
  AutoReplicationType.All
);

export const statisticsMerge$ = writableStringLocalStorageSubject<MergeMode>()(
  'sync.statisticsMerge',
  MergeMode.MERGE
);

export const readingGoalsMerge$ = writableStringLocalStorageSubject<MergeMode>()(
  'sync.readingGoalsMerge',
  MergeMode.MERGE
);

export const cacheRemoteFileLists$ = writableStringLocalStorageSubject<'on' | 'off'>()(
  'sync.cacheRemoteFileLists',
  'off'
);
