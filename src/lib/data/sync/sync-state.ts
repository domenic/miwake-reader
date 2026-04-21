import type { cloudConnection$, fsConnection$, BackendHealth } from './sync-store';

export type SyncIndicatorState =
  | { kind: 'disabled' }
  | { kind: 'offline' }
  | { kind: 'idle'; lastSyncedAt: number | null }
  | { kind: 'syncing' }
  | {
      kind: 'needs-attention';
      backend: 'cloud' | 'fs';
      reason: 'reauth' | 'permission';
      summary: string;
    }
  | {
      kind: 'error';
      backend: 'cloud' | 'fs';
      summary: string;
    };

export function deriveIndicatorState({
  cloud,
  fs,
  cloudH,
  fsH,
  online,
  syncing
}: {
  cloud: ReturnType<typeof cloudConnection$.getValue>;
  fs: ReturnType<typeof fsConnection$.getValue>;
  cloudH: BackendHealth;
  fsH: BackendHealth;
  online: boolean;
  syncing: boolean;
}): SyncIndicatorState {
  if (!cloud && !fs) return { kind: 'disabled' };
  if (!online) return { kind: 'offline' };

  const candidates: SyncIndicatorState[] = [];

  if (cloud) {
    if (cloudH.status === 'reauth-required') {
      candidates.push({
        kind: 'needs-attention',
        backend: 'cloud',
        reason: 'reauth',
        summary: cloudH.summary
      });
    } else if (cloudH.status === 'permission-required') {
      candidates.push({
        kind: 'needs-attention',
        backend: 'cloud',
        reason: 'permission',
        summary: cloudH.summary
      });
    } else if (cloudH.status === 'error') {
      candidates.push({ kind: 'error', backend: 'cloud', summary: cloudH.summary });
    }
  }

  if (fs) {
    if (fsH.status === 'reauth-required' || fsH.status === 'permission-required') {
      candidates.push({
        kind: 'needs-attention',
        backend: 'fs',
        reason: fsH.status === 'reauth-required' ? 'reauth' : 'permission',
        summary: fsH.summary
      });
    } else if (fsH.status === 'error') {
      candidates.push({ kind: 'error', backend: 'fs', summary: fsH.summary });
    }
  }

  // Priority: error > needs-attention > syncing > idle.
  const error = candidates.find((c) => c.kind === 'error');
  if (error) return error;

  const attention = candidates.find((c) => c.kind === 'needs-attention');
  if (attention) return attention;

  if (syncing) return { kind: 'syncing' };

  const lastSyncedAt = Math.max(cloud?.lastSyncedAt ?? 0, fs?.lastSyncedAt ?? 0) || null;
  return { kind: 'idle', lastSyncedAt };
}
