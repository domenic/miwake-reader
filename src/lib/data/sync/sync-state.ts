import { AutoReplicationType } from '$lib/functions/replication/replication-options';
import type { SyncLocation, SyncLocationHealth } from './sync-store.svelte';

export type SyncIndicatorState =
  | { kind: 'disabled' }
  | { kind: 'off' }
  | { kind: 'offline' }
  | { kind: 'idle'; lastSyncedAt: number | null }
  | { kind: 'pending' }
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
  direction,
  pending,
  syncing
}: {
  location: SyncLocation | null;
  health: SyncLocationHealth;
  online: boolean;
  direction: AutoReplicationType;
  pending: boolean;
  syncing: boolean;
}): SyncIndicatorState {
  if (!location) return { kind: 'disabled' };
  if (direction === AutoReplicationType.Off) return { kind: 'off' };
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
  if (pending) return { kind: 'pending' };

  return { kind: 'idle', lastSyncedAt: location.lastSyncedAt };
}
