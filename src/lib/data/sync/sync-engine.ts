import type { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import type { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';
import { NeedsInteractiveAuthError } from '$lib/data/storage/storage-oauth-manager';
import { StorageDataType, StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';
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
  type CloudConnectionState,
  type CloudProviderType,
  type FsConnectionState
} from '$lib/data/sync/sync-store';
import { logger } from '$lib/data/logger';

type SubjectReader<T> = { getValue(): T };
function read<T>(s: unknown): T {
  return (s as SubjectReader<T>).getValue();
}

const FS_SOURCE_NAME = 'miwake-fs';

function cloudSourceName(provider: CloudProviderType, custom: boolean): string {
  if (provider === StorageKey.GDRIVE) {
    return custom ? 'miwake-gdrive-custom' : StorageSourceDefault.GDRIVE_DEFAULT;
  }
  return custom ? 'miwake-onedrive-custom' : StorageSourceDefault.ONEDRIVE_DEFAULT;
}

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

    cloudHealth$.next({ status: 'ok' });
    await drainReplayQueue();
  } catch (err) {
    if (err instanceof NeedsInteractiveAuthError) {
      cloudHealth$.next({
        status: 'reauth-required',
        summary: 'Sign-in expired',
        detail:
          'Reconnect your cloud account to resume syncing. Your data on the cloud is unchanged.'
      });
      return;
    }

    logger.warn(`reconcileCloudBooks failed: ${err instanceof Error ? err.message : String(err)}`);
    cloudHealth$.next({
      status: 'error',
      summary: "Couldn't read your cloud library",
      detail: err instanceof Error ? err.message : String(err)
    });
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
  if (pending.size === 0) return;

  const batch = pending;
  pending = new Map();
  pushRunning = true;

  try {
    for (const { context, types } of batch.values()) {
      await pushOne(context, [...types]);
    }
  } finally {
    pushRunning = false;
    // If anything accumulated while we were running, schedule again.
    if (pending.size > 0) schedulePushRun();
  }
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
      cloudHealth$.next({ status: 'ok' });
    } catch (err) {
      handlePushFailure('cloud', err, () => pushOne(context, types));
    }
  }

  if (fs) {
    const handler = getFsHandler(FS_SOURCE_NAME);
    try {
      const error = await replicateData(local, handler, false, [context], types);
      if (error) throw new Error(error);
      fsHealth$.next({ status: 'ok' });
    } catch (err) {
      handlePushFailure('fs', err);
    }
  }
}

function handlePushFailure(
  target: 'cloud' | 'fs',
  err: unknown,
  enqueueReplay?: () => Promise<void>
): void {
  const healthSubject = target === 'cloud' ? cloudHealth$ : fsHealth$;
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof NeedsInteractiveAuthError) {
    healthSubject.next({
      status: 'reauth-required',
      summary: 'Sign-in expired',
      detail: 'Reconnect to resume syncing. Queued changes will be pushed on reconnect.'
    });
    if (enqueueReplay) replayQueue.push(enqueueReplay);
    return;
  }

  logger.warn(`sync push failed (${target}): ${message}`);
  healthSubject.next({
    status: 'error',
    summary: 'Sync failed',
    detail: message
  });
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
      cloudHealth$.next({ status: 'ok' });
    } catch (err) {
      if (err instanceof NeedsInteractiveAuthError) {
        cloudHealth$.next({
          status: 'reauth-required',
          summary: 'Sign-in expired',
          detail: 'Reconnect to resume syncing.'
        });
      } else {
        logger.warn(
          `reconcileForBookOpen (cloud) failed: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  if (fs) {
    const handler = getFsHandler(FS_SOURCE_NAME);
    try {
      const error = await replicateData(handler, local, false, [context], types);
      if (error) throw new Error(error);
      fsHealth$.next({ status: 'ok' });
    } catch (err) {
      logger.warn(
        `reconcileForBookOpen (fs) failed: ${err instanceof Error ? err.message : String(err)}`
      );
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

  const locations: BaseStorageHandler[] = [];
  if (cloud) {
    const name = cloudSourceName(cloud.provider, cloud.usesCustomCredentials);
    const handler = getCloudHandler(cloud.provider, name);
    await handler.authenticate(null, true);
    locations.push(handler);
  }
  if (fs) locations.push(getFsHandler(FS_SOURCE_NAME));

  for (const remote of locations) {
    if (direction === 'newest' || direction === 'remote-wins') {
      await runPair(remote, local); // pull
    }
    if (direction === 'newest' || direction === 'local-wins') {
      await runPair(local, remote); // push
    }
  }
}

// ---------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------

/** True if a sync is either in-flight or pending (for unload guard). */
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
