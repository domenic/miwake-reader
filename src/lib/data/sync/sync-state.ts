import type { SyncLocation, SyncLocationHealth } from './sync-store.svelte';

export type SyncIndicatorState =
  | { kind: 'disabled' }
  | { kind: 'offline' }
  | { kind: 'idle'; lastSyncedAt: number | null }
  | { kind: 'syncing' }
  | {
      kind: 'needs-attention';
      reason: 'reauth' | 'permission';
      summary: string;
    }
  | {
      kind: 'error';
      summary: string;
    };

export function deriveIndicatorState({
  location,
  health,
  online,
  syncing
}: {
  location: SyncLocation | null;
  health: SyncLocationHealth;
  online: boolean;
  syncing: boolean;
}): SyncIndicatorState {
  if (!location) return { kind: 'disabled' };
  if (!online) return { kind: 'offline' };

  if (health.status === 'reauth-required') {
    return { kind: 'needs-attention', reason: 'reauth', summary: health.summary };
  }
  if (health.status === 'permission-required') {
    return { kind: 'needs-attention', reason: 'permission', summary: health.summary };
  }
  if (health.status === 'error') {
    return { kind: 'error', summary: health.summary };
  }

  if (syncing) return { kind: 'syncing' };

  return { kind: 'idle', lastSyncedAt: location.lastSyncedAt };
}
