import { writable } from 'svelte/store';
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
 * In-memory only: rebuilt from IndexedDB on every app boot via
 * loadConnectionsFromDb. Persisting to localStorage would just be a
 * stale cache against the IDB-of-record (and was, up to now).
 */
export const syncLocation$ = writable<SyncLocation | null>(null);

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

// Health is purely runtime — set by the engine in response to the
// most recent sync attempt.
export const syncHealth$ = writable<SyncLocationHealth>({ status: 'ok' });

/**
 * Live indicator of whether the sync engine is either actively pushing
 * or has work pending. The engine flips this as it schedules, runs, and
 * completes debounced pushes; UI subscribes via `$isSyncing$`.
 */
export const isSyncing$ = writable(false);

/**
 * Coarse-grained wall-clock tick for `formatRelativeTime` consumers so
 * "Synced 2 minutes ago" keeps rolling even when nothing else triggers
 * a re-render. Updates every 30 seconds — finer than the minute
 * granularity of the label, so drift is bounded.
 *
 * Browser-only: the `setInterval` is a no-op under SSR (module is only
 * imported client-side in our pages), but guarding keeps it honest.
 */
export const now$ = writable(Date.now());
if (typeof window !== 'undefined') {
  setInterval(() => now$.set(Date.now()), 30_000);
}
