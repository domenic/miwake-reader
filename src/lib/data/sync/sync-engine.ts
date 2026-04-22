import type { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import type { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';
import { NeedsInteractiveAuthError } from '$lib/data/storage/storage-oauth-manager';
import { StorageDataType, StorageKey } from '$lib/data/storage/storage-types';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import { MergeMode } from '$lib/data/merge-mode';
import {
  AutoReplicationType,
  ReplicationSaveBehavior
} from '$lib/functions/replication/replication-options';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import { replicateData } from '$lib/functions/replication/replicator';
import {
  autoReplication$,
  cacheStorageData$,
  database,
  readingGoalsMergeMode$,
  replicationSaveBehavior$,
  statisticsMergeMode$
} from '$lib/data/store';
import {
  cloudConnection$,
  cloudHealth$,
  fsConnection$,
  fsHealth$,
  isSyncing$,
  type CloudConnectionState,
  type CloudProviderType,
  type FsConnectionState,
  type SyncLocationHealth
} from '$lib/data/sync/sync-store';
import { cloudSourceName, FS_SOURCE_NAME, readSubject as read } from '$lib/data/sync/sync-helpers';
import { logger } from '$lib/data/logger';

// ---------------------------------------------------------------------
// Handler factories
// ---------------------------------------------------------------------

function getCloudHandler(
  provider: CloudProviderType,
  name: string
): GDriveStorageHandler | OneDriveStorageHandler {
  return provider === StorageKey.GDRIVE
    ? getStorageHandler(
        window,
        StorageKey.GDRIVE,
        name,
        false,
        read<boolean>(cacheStorageData$),
        read<ReplicationSaveBehavior>(replicationSaveBehavior$),
        read<MergeMode>(statisticsMergeMode$),
        read<MergeMode>(readingGoalsMergeMode$),
        false
      )
    : getStorageHandler(
        window,
        StorageKey.ONEDRIVE,
        name,
        false,
        read<boolean>(cacheStorageData$),
        read<ReplicationSaveBehavior>(replicationSaveBehavior$),
        read<MergeMode>(statisticsMergeMode$),
        read<MergeMode>(readingGoalsMergeMode$),
        false
      );
}

function getFsHandler(name: string): BaseStorageHandler {
  return getStorageHandler(
    window,
    StorageKey.FS,
    name,
    false,
    read<boolean>(cacheStorageData$),
    read<ReplicationSaveBehavior>(replicationSaveBehavior$),
    read<MergeMode>(statisticsMergeMode$),
    read<MergeMode>(readingGoalsMergeMode$),
    false
  );
}

function getBrowserHandler(): BaseStorageHandler {
  return getStorageHandler(
    window,
    StorageKey.BROWSER,
    '',
    true,
    read<boolean>(cacheStorageData$),
    read<ReplicationSaveBehavior>(replicationSaveBehavior$),
    read<MergeMode>(statisticsMergeMode$),
    read<MergeMode>(readingGoalsMergeMode$)
  );
}

// ---------------------------------------------------------------------
// Connection-state updates
//
// Connect/disconnect lifecycle lives in source-manager.ts; here we
// patch in per-sync metadata (`lastSyncedAt`, `bookCount`) after
// successful engine operations. All writes go through these helpers so
// we don't accidentally clobber unrelated fields.
// ---------------------------------------------------------------------

function patchCloudConnection(patch: Partial<CloudConnectionState>): void {
  const current = read<CloudConnectionState | null>(cloudConnection$);
  if (!current) return;
  cloudConnection$.next({ ...current, ...patch });
}

function patchFsConnection(patch: Partial<FsConnectionState>): void {
  const current = read<FsConnectionState | null>(fsConnection$);
  if (!current) return;
  fsConnection$.next({ ...current, ...patch });
}

function markCloudSynced(extra: Partial<CloudConnectionState> = {}): void {
  patchCloudConnection({ lastSyncedAt: Date.now(), ...extra });
  cloudHealth$.next({ status: 'ok' });
}

function markFsSynced(): void {
  patchFsConnection({ lastSyncedAt: Date.now() });
  fsHealth$.next({ status: 'ok' });
}

/**
 * Classify a caught error and update the appropriate health store.
 * Returns `true` if the error was a `NeedsInteractiveAuthError` so the
 * caller can decide whether to queue the op for replay.
 */
function reportSyncError(target: 'cloud' | 'fs', context: string, err: unknown): boolean {
  const healthSubject = target === 'cloud' ? cloudHealth$ : fsHealth$;
  const isReauth = err instanceof NeedsInteractiveAuthError;
  const message = err instanceof Error ? err.message : String(err);

  if (isReauth) {
    const health: SyncLocationHealth = {
      status: 'reauth-required',
      summary: 'Sign-in expired',
      detail: 'Reconnect to resume syncing. Queued changes will be pushed on reconnect.'
    };
    healthSubject.next(health);
    return true;
  }

  logger.warn(`sync ${context} failed (${target}): ${message}`);
  healthSubject.next({
    status: 'error',
    summary: 'Sync failed',
    detail: message
  });
  return false;
}

// ---------------------------------------------------------------------
// Placeholder reconciliation
// ---------------------------------------------------------------------

/**
 * Given a list of book cards from a remote sync location, write a
 * placeholder row into local IndexedDB for any title that isn't
 * already present, and repoint orphaned placeholders (those that
 * reference a source record that no longer exists) at the current
 * source so the click-to-download flow works again. Returns the count
 * of rows created or touched.
 */
export async function ensurePlaceholders(
  remoteCards: ReadonlyArray<{
    title: string;
    characters?: number;
    lastBookModified?: number;
  }>,
  storageSourceName: string
): Promise<number> {
  let touched = 0;

  const db = await database.db;
  const liveSourceNames = new Set((await db.getAll('storageSource')).map((s) => s.name));

  for (const card of remoteCards) {
    const existing = await database.getDataByTitle(card.title);

    if (existing) {
      const isOrphanedPlaceholder =
        !existing.elementHtml &&
        existing.storageSource &&
        !liveSourceNames.has(existing.storageSource);
      const notYetAssigned = !existing.elementHtml && !existing.storageSource;

      logger.debug(
        `ensurePlaceholders: existing match for ${JSON.stringify(existing.title)} — ` +
          `hasHtml=${!!existing.elementHtml}, ` +
          `storageSource=${JSON.stringify(existing.storageSource ?? null)}, ` +
          `orphaned=${isOrphanedPlaceholder}, notYetAssigned=${notYetAssigned}`
      );

      if (isOrphanedPlaceholder || notYetAssigned) {
        await db.put('data', { ...existing, storageSource: storageSourceName });
        touched += 1;
      }
      continue;
    }

    logger.debug(
      `ensurePlaceholders: no local record for ${JSON.stringify(card.title)}, creating placeholder`
    );

    await database.upsertData(
      {
        title: card.title,
        elementHtml: '',
        styleSheet: '',
        blobs: {},
        coverImage: '',
        hasThumb: false,
        characters: card.characters || 0,
        sections: [],
        lastBookModified: card.lastBookModified || 0,
        lastBookOpen: 0,
        storageSource: storageSourceName
      },
      ReplicationSaveBehavior.NewOnly,
      true,
      /* removeStorageContext */ false
    );
    touched += 1;
  }

  return touched;
}

/**
 * Remove local placeholder rows whose `storageSource` points at a
 * record that no longer exists AND whose title is not in the current
 * remote list. Those books are unreachable.
 */
export async function pruneOrphanedPlaceholders(currentRemoteTitles: Set<string>): Promise<number> {
  const db = await database.db;
  const liveSourceNames = new Set((await db.getAll('storageSource')).map((s) => s.name));
  const allBooks = await db.getAll('data');

  let pruned = 0;
  for (const book of allBooks) {
    const isPlaceholder = !book.elementHtml;
    const hasOrphanedSource = !!book.storageSource && !liveSourceNames.has(book.storageSource);
    const reachableOnCurrentRemote = currentRemoteTitles.has(book.title);

    if (isPlaceholder && hasOrphanedSource && !reachableOnCurrentRemote) {
      await db.delete('data', book.id);
      pruned += 1;
    }
  }

  return pruned;
}

/**
 * Boot-time reconciliation: pull the remote book list from the
 * connected cloud source and reconcile local placeholders. Silent
 * auth; on failure surfaces `reauth-required` health status.
 */
export async function reconcileCloudBooks(): Promise<void> {
  const cloud = read<CloudConnectionState | null>(cloudConnection$);
  if (!cloud) return;

  const name = cloudSourceName(cloud.provider, cloud.usesCustomCredentials);
  const handler = getCloudHandler(cloud.provider, name);

  try {
    await handler.authenticate(null, true);

    const remoteBooks = await handler.getBookList();
    logger.debug(
      `reconcileCloudBooks: ${name} returned ${remoteBooks.length} remote book(s): ` +
        remoteBooks.map((b) => JSON.stringify(b.title)).join(', ')
    );

    const touched = await ensurePlaceholders(remoteBooks, name);
    const remoteTitles = new Set(remoteBooks.map((b) => b.title));
    const pruned = await pruneOrphanedPlaceholders(remoteTitles);
    logger.debug(`reconcileCloudBooks: touched=${touched}, pruned=${pruned}`);

    if (touched > 0 || pruned > 0) {
      database.dataListChanged$.next(undefined);
    }

    markCloudSynced({ bookCount: remoteBooks.length });
    await drainReplayQueue();
  } catch (err) {
    reportSyncError('cloud', 'reconcileCloudBooks', err);
  }
}

// ---------------------------------------------------------------------
// Ambient push (local → connected locations)
//
// triggerSync() is called by the reader whenever a local edit happens
// (bookmark save, stat update, etc.). It coalesces multiple calls into
// a single debounced push. Silent auth — if the cached refresh token
// is stale, the push is queued for replay after the user reconnects.
// ---------------------------------------------------------------------

const PUSH_DEBOUNCE_MS = 5000;

interface PendingPush {
  context: ReplicationContext;
  types: Set<StorageDataType>;
}

let pending: Map<string, PendingPush> = new Map();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushRunning = false;
const replayQueue: Array<() => Promise<void>> = [];

/** Key by book title so concurrent edits to the same book coalesce. */
function pendingKey(context: ReplicationContext): string {
  return context.title;
}

export function triggerSync(dataType: StorageDataType, context: ReplicationContext): void {
  const direction = read<AutoReplicationType>(autoReplication$);
  if (direction === AutoReplicationType.Off || direction === AutoReplicationType.Down) return;

  const cloud = read<CloudConnectionState | null>(cloudConnection$);
  const fs = read<FsConnectionState | null>(fsConnection$);
  if (!cloud && !fs) return;

  const key = pendingKey(context);
  const existing = pending.get(key);
  if (existing) {
    existing.types.add(dataType);
  } else {
    pending.set(key, { context, types: new Set([dataType]) });
  }

  isSyncing$.next(true);
  schedulePushRun();
}

function schedulePushRun(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void runPendingPushes();
  }, PUSH_DEBOUNCE_MS);
}

async function runPendingPushes(): Promise<void> {
  if (pushRunning) {
    // Another run is in flight; reschedule so we catch what accumulated.
    schedulePushRun();
    return;
  }
  if (pending.size === 0) {
    emitSyncingState();
    return;
  }

  const batch = pending;
  pending = new Map();
  pushRunning = true;
  emitSyncingState();

  try {
    for (const { context, types } of batch.values()) {
      await pushOne(context, [...types]);
    }
  } finally {
    pushRunning = false;
    // If anything accumulated while we were running, schedule again.
    if (pending.size > 0) schedulePushRun();
    emitSyncingState();
  }
}

function emitSyncingState(): void {
  const active = pushRunning || pending.size > 0 || pushTimer !== null;
  if (isSyncing$.getValue() !== active) isSyncing$.next(active);
}

async function pushOne(context: ReplicationContext, types: StorageDataType[]): Promise<void> {
  const cloud = read<CloudConnectionState | null>(cloudConnection$);
  const fs = read<FsConnectionState | null>(fsConnection$);
  const local = getBrowserHandler();

  if (cloud) {
    const name = cloudSourceName(cloud.provider, cloud.usesCustomCredentials);
    const handler = getCloudHandler(cloud.provider, name);
    try {
      await handler.authenticate(null, true);
      const error = await replicateData(local, handler, false, [context], types);
      if (error) throw new Error(error);
      markCloudSynced();
    } catch (err) {
      const wasReauth = reportSyncError('cloud', 'push', err);
      if (wasReauth) replayQueue.push(() => pushOne(context, types));
    }
  }

  if (fs) {
    const handler = getFsHandler(FS_SOURCE_NAME);
    try {
      const error = await replicateData(local, handler, false, [context], types);
      if (error) throw new Error(error);
      markFsSynced();
    } catch (err) {
      reportSyncError('fs', 'push', err);
    }
  }
}

async function drainReplayQueue(): Promise<void> {
  if (replayQueue.length === 0) return;
  logger.debug(`drainReplayQueue: replaying ${replayQueue.length} queued op(s)`);
  const queue = replayQueue.splice(0);
  for (const op of queue) {
    try {
      await op();
    } catch (err) {
      logger.warn(`replay failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ---------------------------------------------------------------------
// Reader hook: pull per-book data on book open
// ---------------------------------------------------------------------

/**
 * Called by the reader when a book is opened. Pulls PROGRESS,
 * STATISTICS, and READING_GOALS from each connected location so the
 * reader starts from the freshest state. Silent auth — failures
 * surface via health state; the reader continues with local data.
 *
 * Respects the autoReplication direction: only pulls if Down or Both.
 */
export async function reconcileForBookOpen(context: ReplicationContext): Promise<void> {
  const direction = read<AutoReplicationType>(autoReplication$);
  if (direction !== AutoReplicationType.Down && direction !== AutoReplicationType.All) return;

  const cloud = read<CloudConnectionState | null>(cloudConnection$);
  const fs = read<FsConnectionState | null>(fsConnection$);
  if (!cloud && !fs) return;

  const types = [
    StorageDataType.PROGRESS,
    StorageDataType.STATISTICS,
    StorageDataType.READING_GOALS
  ];
  const local = getBrowserHandler();

  if (cloud) {
    const name = cloudSourceName(cloud.provider, cloud.usesCustomCredentials);
    const handler = getCloudHandler(cloud.provider, name);
    try {
      await handler.authenticate(null, true);
      const error = await replicateData(handler, local, false, [context], types);
      if (error) throw new Error(error);
      markCloudSynced();
    } catch (err) {
      reportSyncError('cloud', 'reconcileForBookOpen', err);
    }
  }

  if (fs) {
    const handler = getFsHandler(FS_SOURCE_NAME);
    try {
      const error = await replicateData(handler, local, false, [context], types);
      if (error) throw new Error(error);
      markFsSynced();
    } catch (err) {
      reportSyncError('fs', 'reconcileForBookOpen', err);
    }
  }
}

// ---------------------------------------------------------------------
// Force re-sync (explicit user action)
// ---------------------------------------------------------------------

export type ForceResyncDirection = 'newest' | 'local-wins' | 'remote-wins';

/**
 * Force a full reconciliation of every book / bookmark / statistic /
 * reading goal between local and each connected sync location.
 * Direction controls conflict resolution:
 *   - `newest`: per-item timestamp wins (same as ambient sync)
 *   - `local-wins`: local version always replaces remote
 *   - `remote-wins`: remote version always replaces local
 *
 * Throws on failure; caller (the force-resync dialog) shows the error.
 */
export async function forceFullResync(direction: ForceResyncDirection): Promise<void> {
  const cloud = read<CloudConnectionState | null>(cloudConnection$);
  const fs = read<FsConnectionState | null>(fsConnection$);
  if (!cloud && !fs) throw new Error('No sync locations connected.');

  const local = getBrowserHandler();
  const allBooks = await (await database.db).getAll('data');
  const contexts: ReplicationContext[] = allBooks.map((b) => ({
    id: b.id,
    title: b.title,
    imagePath: b.coverImage ?? ''
  }));
  const types = [
    StorageDataType.DATA,
    StorageDataType.PROGRESS,
    StorageDataType.STATISTICS,
    StorageDataType.READING_GOALS
  ];

  async function runPair(from: BaseStorageHandler, to: BaseStorageHandler): Promise<void> {
    const error = await replicateData(from, to, true, contexts, types);
    if (error) throw new Error(error);
  }

  isSyncing$.next(true);
  try {
    let cloudHandler: GDriveStorageHandler | OneDriveStorageHandler | null = null;
    if (cloud) {
      const name = cloudSourceName(cloud.provider, cloud.usesCustomCredentials);
      cloudHandler = getCloudHandler(cloud.provider, name);
      try {
        await cloudHandler.authenticate(null, true);
      } catch (err) {
        // Surface via the indicator too, not just the dialog the caller shows.
        reportSyncError('cloud', 'forceFullResync (auth)', err);
        throw err;
      }
    }
    const fsHandler = fs ? getFsHandler(FS_SOURCE_NAME) : null;

    const pairs: Array<['cloud' | 'fs', BaseStorageHandler]> = [];
    if (cloudHandler) pairs.push(['cloud', cloudHandler]);
    if (fsHandler) pairs.push(['fs', fsHandler]);

    for (const [target, remote] of pairs) {
      try {
        if (direction === 'newest' || direction === 'remote-wins') {
          await runPair(remote, local); // pull
        }
        if (direction === 'newest' || direction === 'local-wins') {
          await runPair(local, remote); // push
        }
        if (target === 'cloud') {
          markCloudSynced();
        } else {
          markFsSynced();
        }
      } catch (err) {
        reportSyncError(target, 'forceFullResync', err);
        throw err;
      }
    }
  } finally {
    emitSyncingState();
  }
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

/**
 * True if a sync is either in-flight or pending. Used by the reader's
 * `beforeunload` guard. For reactive UI, subscribe to `isSyncing$`
 * instead — this function reads the same underlying state.
 */
export function isSyncingOrPending(): boolean {
  return pushRunning || pending.size > 0 || pushTimer !== null;
}

// ---------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------

/**
 * Run once on app boot. Reconciles connected sync locations with
 * local IndexedDB. Safe to call multiple times — each invocation is
 * independent.
 */
export async function syncEngineStart(): Promise<void> {
  await reconcileCloudBooks();
  // FS reconciliation is a future pass — the FS picker creates its
  // own record and the user-initiated force re-sync covers bulk pull.
}

/**
 * Called from the status indicator or reconnect flow after a user
 * gesture has restored auth. Re-runs the boot reconcile and drains
 * any push operations that were queued while auth was bad.
 */
export async function retryAfterReconnect(): Promise<void> {
  await reconcileCloudBooks();
  await drainReplayQueue();
}
