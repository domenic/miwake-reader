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
 * loadConnectionsFromDb. lastCloudHint$ (below) carries a separate
 * preference snapshot so a fresh device restored from app-settings
 * backup can nudge the user to reconnect.
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

/**
 * Cross-device hint surviving in app-settings backups. Captures
 * "the user had Google Drive configured on their other device" so a
 * fresh-device restore can flip syncHealth to reauth-required and
 * nudge them to reconnect, rather than silently looking unconfigured.
 * FS isn't here — the directory handle is local, so a remembered
 * folder name from another machine wouldn't be actionable.
 */
export interface LastCloudHint {
  provider: CloudProviderType;
  usesCustomCredentials: boolean;
}

export const lastCloudHint$ = writableObjectLocalStorageSubject<LastCloudHint | null>()(
  'sync.lastCloudHint',
  null
);

// Custom OAuth credentials are real user config — kept across
// reconnects, switched providers, etc. — so they DO travel with
// app-settings backups.
export const cloudCustomCredentials$ = writableObjectLocalStorageSubject<
  Partial<Record<CloudProviderType, CustomOAuthCredentials>>
>()('sync.cloudCustomCredentials', {});
