import { writable } from 'svelte/store';
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

// cloudConnection$ is a 'preference' so app-settings backups carry a
// hint of which provider you'd had configured. The actual refresh
// token + IDB storageSource record do NOT travel — those are real
// secrets and live in IndexedDB. On a restored device,
// loadConnectionsFromDb sees the stale cloudConnection but no
// matching IDB record and flips cloudHealth to "reauth-required" so
// the UI nudges the user to reconnect rather than silently sitting
// at "Sync not configured."
export const cloudConnection$ = writableObjectLocalStorageSubject<CloudConnectionState | null>()(
  'sync.cloudConnection',
  null
);

// FS handles aren't device-portable — a FileSystemDirectoryHandle
// only makes sense on the machine that granted it. Stay runtime.
export const fsConnection$ = writableObjectLocalStorageSubject<FsConnectionState | null>()(
  'sync.fsConnection',
  null,
  'runtime'
);

// Custom OAuth credentials are real user config — kept across
// reconnects, switched providers, etc. — so they DO travel with
// app-settings backups.
export const cloudCustomCredentials$ = writableObjectLocalStorageSubject<
  Partial<Record<CloudProviderType, CustomOAuthCredentials>>
>()('sync.cloudCustomCredentials', {});

// Health is purely runtime — set by the engine in response to the
// most recent sync attempt.
export const cloudHealth$ = writableObjectLocalStorageSubject<SyncLocationHealth>()(
  'sync.cloudHealth',
  { status: 'ok' },
  'runtime'
);

export const fsHealth$ = writableObjectLocalStorageSubject<SyncLocationHealth>()(
  'sync.fsHealth',
  { status: 'ok' },
  'runtime'
);

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
