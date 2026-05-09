import { writableObjectLocalStorageSubject } from '$lib/data/internal/writable-object-local-storage-subject';
import { SyncEndpointType } from '$lib/data/storage/storage-types';

export type CloudProviderType = SyncEndpointType.GDRIVE | SyncEndpointType.ONEDRIVE;

/**
 * The single sync location the user has configured, or null if none.
 * Discriminated by `kind`; cloud variants carry provider/custom-creds
 * info, the filesystem variant carries the local folder's display
 * path.
 *
 * Runtime-only: rebuilt from IndexedDB on every app boot via
 * loadConnectionsFromDb.
 */
export type SyncLocation =
  | {
      kind: 'cloud';
      provider: CloudProviderType;
      usesCustomCredentials: boolean;
      connectedAt: number;
      lastSyncedAt: number | null;
      bookCount: number | null;
    }
  | {
      kind: 'fs';
      path: string;
      connectedAt: number;
      lastSyncedAt: number | null;
    };

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

/**
 * Runtime sync state. Read directly (`syncState.location`) from both
 * imperative TS callers and component templates / `$derived` /
 * `$effect` — runes track property access automatically. Written
 * directly too (`syncState.location = …`).
 *
 * - `location`: rebuilt from IndexedDB at boot via
 *   loadConnectionsFromDb; never persisted here, since the
 *   storageSource record is the source of truth.
 * - `health`: written by the sync engine after each ambient or
 *   long-running attempt.
 * - `isSyncing`: live indicator of whether a push or long-running
 *   op is in flight or pending.
 */
export const syncState = $state<{
  location: SyncLocation | null;
  health: SyncLocationHealth;
  isSyncing: boolean;
}>({
  location: null,
  health: { status: 'ok' },
  isSyncing: false
});

// Custom OAuth credentials are real user config — kept across
// reconnects, switched providers, etc. — so they DO travel with
// app-settings backups.
export const cloudCustomCredentials$ = writableObjectLocalStorageSubject<
  Partial<Record<CloudProviderType, CustomOAuthCredentials>>
>()('sync.cloudCustomCredentials', {});
