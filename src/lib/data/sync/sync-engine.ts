import type {
  LocalReplicationEndpoint,
  ScopedSettings,
  SyncEndpoint
} from '$lib/data/storage/handler/handler-roles';
import { NeedsInteractiveAuthError, NeedsPermissionGrantError } from '$lib/data/storage/errors';
import { StorageDataType, SyncEndpointType } from '$lib/data/storage/storage-types';
import { getLocalEndpoint, getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
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
  isOnline$,
  readingGoalsMergeMode$,
  statisticsMergeMode$
} from '$lib/data/store';
import { syncState, type SyncLocation } from '$lib/data/sync/sync-store.svelte';
import { cloudSourceName, FS_SOURCE_NAME } from '$lib/data/sync/sync-helpers';
import { reconcilePlaceholders } from '$lib/data/sync/placeholder-reconciler';
import { logger } from '$lib/data/logger';

// ---------------------------------------------------------------------
// Handler factories
// ---------------------------------------------------------------------

/**
 * Build the per-replicateData settings bag.
 *
 * `winnerTakesAll: true` forces every knob the replicator's "this
 * target row survives" decision touches into a "source replaces
 * target" position at once:
 *   - `saveBehavior=Overwrite` makes `getFilenameForRecentCheck`
 *     return undefined (replicator-level up-to-date short-circuit
 *     bypassed) AND makes the target's save method skip its own
 *     NewOnly timestamp check.
 *   - statistics / reading-goals merge modes go to `'replace'` so
 *     `storeStatistics` / `storeReadingGoals` overwrite the existing
 *     set instead of merging in target-only rows.
 *
 * Used by force-resync (`local-wins` / `remote-wins`), backup-import
 * (`zip-wins`), and the single-type winner-takes-all pushes from
 * `userDeleteStatisticEntries` / `userDeleteReadingGoal`. Default
 * (winnerTakesAll=false) honors the user's ambient preferences.
 */
export function scopedSettings({ winnerTakesAll = false } = {}): ScopedSettings {
  if (winnerTakesAll) {
    return {
      saveBehavior: ReplicationSaveBehavior.Overwrite,
      statisticsMergeMode: 'replace',
      readingGoalsMergeMode: 'replace'
    };
  }
  // Ambient/newest semantics imply NewOnly: per-item timestamp
  // protection is part of the contract, not a tunable. The merge
  // modes ARE user-tunable (Advanced > merge mode).
  return {
    saveBehavior: ReplicationSaveBehavior.NewOnly,
    statisticsMergeMode: statisticsMergeMode$.getValue(),
    readingGoalsMergeMode: readingGoalsMergeMode$.getValue()
  };
}

/**
 * Build the SyncEndpoint for whatever location is currently
 * configured. Silent paths (sync engine) pass `silentOnly: true` to
 * `listSyncTitles` / `ensureRoot` directly — not via the factory.
 */
function endpointFor(location: SyncLocation): SyncEndpoint {
  const settings = { cacheStorageData: cacheStorageData$.getValue() };
  if (location.kind === 'cloud') {
    const name = cloudSourceName(location.provider, location.usesCustomCredentials);
    return location.provider === SyncEndpointType.GDRIVE
      ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, name, settings)
      : getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, name, settings);
  }
  return getSyncEndpoint(window, SyncEndpointType.FS, FS_SOURCE_NAME, settings);
}

function localEndpoint(): LocalReplicationEndpoint {
  return getLocalEndpoint();
}

// ---------------------------------------------------------------------
// Connection-state updates
// ---------------------------------------------------------------------

function patchLocation(patch: Partial<SyncLocation>): void {
  const current = syncState.location;
  if (!current) return;
  syncState.location = { ...current, ...patch } as SyncLocation;
}

function markSynced(extra: Partial<SyncLocation> = {}): void {
  patchLocation({ lastSyncedAt: Date.now(), ...extra });
  syncState.health = { status: 'ok' };
}

/**
 * Classify a caught error and update the health store. Returns true
 * if the error was user-recoverable (NeedsInteractiveAuthError /
 * NeedsPermissionGrantError) so the caller can queue the op for
 * replay rather than treating it as a hard failure.
 */
function reportSyncError(context: string, err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof NeedsInteractiveAuthError) {
    syncState.health = {
      status: 'reauth-required',
      summary: 'Sign-in expired',
      detail: 'Reconnect to resume syncing. Queued changes will be pushed on reconnect.'
    };
    return true;
  }

  if (err instanceof NeedsPermissionGrantError) {
    syncState.health = {
      status: 'permission-required',
      summary: 'Filesystem access needed',
      detail:
        'Grant access to your sync folder to resume syncing. Queued changes will be pushed once granted.'
    };
    return true;
  }

  logger.warn(`sync ${context} failed: ${message}`);
  syncState.health = { status: 'error', summary: 'Sync failed', detail: message };
  return false;
}

/**
 * Boot-time reconciliation: pull the title list from the configured
 * sync location and reconcile local placeholders. Silent auth (cloud)
 * / silent permission (FS); failures surface via syncHealth$. No-op
 * if no location is connected.
 */
export async function reconcileBooksOnBoot(): Promise<void> {
  const location = syncState.location;
  if (!location) return;

  const handler = endpointFor(location);

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      await handler.authenticate(null, true);
    }

    const remoteBooks = await handler.listSyncTitles({ silentOnly: true });
    logger.debug(
      `reconcileBooksOnBoot: ${location.kind} returned ${remoteBooks.length} book(s): ` +
        remoteBooks.map((b) => JSON.stringify(b.title)).join(', ')
    );

    // Listing succeeded; if it had thrown above, the outer catch would
    // skip this block — so a transient network / permission error
    // can't nuke placeholders by accident.
    await reconcilePlaceholders(remoteBooks);

    markSynced(location.kind === 'cloud' ? { bookCount: remoteBooks.length } : {});
    await drainReplayQueue();
  } catch (err) {
    reportSyncError('reconcileBooksOnBoot', err);
  } finally {
    endLongRunning();
  }
}

// ---------------------------------------------------------------------
// Ambient push (local → connected location)
//
// triggerSync() is called by the reader whenever a local edit happens
// (bookmark save, stat update, etc.). It coalesces multiple calls into
// a single debounced push. Silent auth — if the cached refresh token
// is stale, the push is queued for replay after the user reconnects.
// ---------------------------------------------------------------------

const PUSH_DEBOUNCE_MS = 5000;

/** Safety rail on the reauth-replay queue. Well above any realistic
 *  edit rate during a single disconnected session; prevents runaway
 *  memory growth if the user's auth stays broken indefinitely. */
const REPLAY_QUEUE_MAX = 500;

interface PendingPush {
  context: ReplicationContext;
  types: Set<StorageDataType>;
}

let pending: Map<string, PendingPush> = new Map();
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushRunning = false;
/** Non-push long-running operations (boot reconcile, per-book pull,
 *  force resync). Incremented at entry, decremented in `finally`;
 *  emitSyncingState ORs this with push state. */
let longRunningOps = 0;
const replayQueue: Array<() => Promise<void>> = [];

function enqueueReplay(op: () => Promise<void>): void {
  if (replayQueue.length >= REPLAY_QUEUE_MAX) {
    logger.warn(`sync replay queue at cap (${REPLAY_QUEUE_MAX}); dropping oldest queued op`);
    replayQueue.shift();
  }
  replayQueue.push(op);
}

function beginLongRunning(): void {
  longRunningOps += 1;
  emitSyncingState();
}

function endLongRunning(): void {
  longRunningOps = Math.max(0, longRunningOps - 1);
  emitSyncingState();
}

/** Key by book title so concurrent edits to the same book coalesce. */
function pendingKey(context: ReplicationContext): string {
  return context.title;
}

export function triggerSync(dataType: StorageDataType, context: ReplicationContext): void {
  const direction = autoReplication$.getValue();
  if (direction === AutoReplicationType.Off || direction === AutoReplicationType.Down) return;

  const location = syncState.location;
  if (!location) return;

  const key = pendingKey(context);
  const existing = pending.get(key);
  if (existing) {
    existing.types.add(dataType);
  } else {
    pending.set(key, { context, types: new Set([dataType]) });
  }

  syncState.isSyncing = true;
  schedulePushRun();
}

/**
 * Schedule ambient pushes for every locally-downloaded book. Called
 * from connect flows so existing library content propagates to the
 * newly-attached location: ambient sync only fires on local edits
 * via triggerSync, so a freshly-connected (and possibly empty)
 * location would otherwise stay missing every book the user already
 * has — bookmark/edit triggers only fire PROGRESS/STATISTICS for the
 * touched book, never DATA.
 *
 * Placeholders (no elementHtml) are skipped — they have nothing to
 * push.
 */
export async function pushAllLocalBooks(): Promise<void> {
  const db = await database.db;
  const all = await db.getAll('data');
  for (const book of all) {
    if (!book.elementHtml) continue;
    const context: ReplicationContext = {
      id: book.id,
      title: book.title,
      imagePath: book.coverImage || ''
    };
    triggerSync(StorageDataType.DATA, context);
    triggerSync(StorageDataType.PROGRESS, context);
    triggerSync(StorageDataType.STATISTICS, context);
    triggerSync(StorageDataType.READING_GOALS, context);
  }
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
    if (pending.size > 0) schedulePushRun();
    emitSyncingState();
  }
}

function emitSyncingState(): void {
  const active = pushRunning || pending.size > 0 || pushTimer !== null || longRunningOps > 0;
  if (syncState.isSyncing !== active) syncState.isSyncing = active;
}

async function pushOne(context: ReplicationContext, types: StorageDataType[]): Promise<void> {
  const location = syncState.location;
  if (!location) return;

  if (location.kind === 'cloud' && !isOnline$.getValue()) {
    // Offline — queue for replay and leave syncHealth$ alone so the
    // indicator shows the offline state rather than a spurious
    // "Sync failed" error on every edit.
    logger.debug(`push: offline, queueing cloud push for ${JSON.stringify(context.title)}`);
    enqueueReplay(() => pushOne(context, types));
    return;
  }

  const local = localEndpoint();
  const handler = endpointFor(location);

  try {
    if (location.kind === 'cloud') {
      await handler.authenticate(null, true);
    }
    await replicateData({
      library: local,
      endpoint: handler,
      direction: 'push',
      refreshDataList: false,
      contexts: [context],
      dataToReplicate: types,
      settings: scopedSettings()
    });
    markSynced();
  } catch (err) {
    const recoverable = reportSyncError('push', err);
    if (recoverable) enqueueReplay(() => pushOne(context, types));
  }
}

async function drainReplayQueue(): Promise<void> {
  if (replayQueue.length === 0) return;
  logger.debug(`drainReplayQueue: replaying ${replayQueue.length} queued op(s)`);
  const queue = replayQueue.splice(0);
  for (const op of queue) {
    try {
      await op();
    } catch (err: any) {
      // pushOne (the only enqueueReplay producer today) catches its
      // own errors and self-re-enqueues if recoverable, so this catch
      // is rarely hit. Re-enqueue anyway so a future op that *does*
      // throw doesn't get silently dropped along with the user's edit.
      logger.warn(`replay failed, re-enqueuing: ${err.message}`);
      enqueueReplay(op);
    }
  }
}

// ---------------------------------------------------------------------
// Reader hook: pull per-book data on book open
// ---------------------------------------------------------------------

/**
 * Called by the reader when a book is opened. Pulls per-book state
 * (and the book content if local is a placeholder) from the configured
 * sync location. Silent — failures surface via syncHealth$; the
 * reader continues with whatever local data it has.
 *
 * Respects the autoReplication direction: only pulls if Down or Both.
 */
export async function reconcileForBookOpen(context: ReplicationContext): Promise<void> {
  const direction = autoReplication$.getValue();
  if (direction !== AutoReplicationType.Down && direction !== AutoReplicationType.All) {
    logger.debug(
      `reconcileForBookOpen: skipping (autoReplication=${direction}) for ${JSON.stringify(context.title)}`
    );
    return;
  }

  const location = syncState.location;
  if (!location) {
    logger.debug(`reconcileForBookOpen: no sync location for ${JSON.stringify(context.title)}`);
    return;
  }

  // If the local row is a placeholder (no elementHtml), the book hasn't
  // been downloaded yet — include DATA in the pull so the reader has
  // something to render.
  const localBook = context.id
    ? await database.getData(context.id)
    : await database.getDataByTitle(context.title);
  const isPlaceholder = !!localBook && !localBook.elementHtml;
  const types = [
    ...(isPlaceholder ? [StorageDataType.DATA] : []),
    StorageDataType.PROGRESS,
    StorageDataType.STATISTICS,
    StorageDataType.READING_GOALS
  ];
  const local = localEndpoint();
  const handler = endpointFor(location);
  logger.debug(
    `reconcileForBookOpen: start for ${JSON.stringify(context.title)} ` +
      `(location=${location.kind}, isPlaceholder=${isPlaceholder}, types=[${types.join(',')}])`
  );

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      logger.debug('reconcileForBookOpen: cloud authenticate (silent)');
      await handler.authenticate(null, true);
    }
    await replicateData({
      library: local,
      endpoint: handler,
      direction: 'pull',
      refreshDataList: false,
      contexts: [context],
      dataToReplicate: types,
      settings: scopedSettings()
    });
    markSynced();
  } catch (err) {
    reportSyncError('reconcileForBookOpen', err);
  } finally {
    endLongRunning();
  }
}

// ---------------------------------------------------------------------
// Force re-sync (explicit user action)
// ---------------------------------------------------------------------

export type ForceResyncDirection = 'newest' | 'local-wins' | 'remote-wins';

/**
 * Force a full reconciliation of every book / bookmark / statistic /
 * reading goal between local and the configured sync location.
 * Direction controls conflict resolution:
 *   - `newest`: per-item timestamp wins (same as ambient sync)
 *   - `local-wins`: local version always replaces remote
 *   - `remote-wins`: remote version always replaces local
 *
 * Throws on failure; caller (the force-resync dialog) shows the error.
 */
export async function forceFullResync(direction: ForceResyncDirection): Promise<void> {
  const location = syncState.location;
  if (!location) throw new Error('No sync location connected.');

  const types = [
    StorageDataType.DATA,
    StorageDataType.PROGRESS,
    StorageDataType.STATISTICS,
    StorageDataType.READING_GOALS
  ];

  // Each leg's settings encode the user's resolution: 'newest' uses
  // ambient prefs (per-item wins-by-timestamp); the winner-takes-all
  // legs force every "target wins" knob to "source wins" via
  // scopedSettings({ winnerTakesAll: true }).
  const pullSettings = scopedSettings({ winnerTakesAll: direction === 'remote-wins' });
  const pushSettings = scopedSettings({ winnerTakesAll: direction === 'local-wins' });

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      try {
        await endpointFor(location).authenticate(null, true);
      } catch (err) {
        reportSyncError('forceFullResync (auth)', err);
        throw err;
      }
    }

    // Reconcile placeholders against the current remote listing
    // first — otherwise the loops below iterate stale local `data`
    // and miss remote-only books or waste cycles on remote-deleted
    // ones.
    const handler = endpointFor(location);
    const remoteBooks = await handler.listSyncTitles({ refresh: true, silentOnly: true });
    await reconcilePlaceholders(remoteBooks);

    const allBooks = await (await database.db).getAll('data');
    const pullContexts: ReplicationContext[] = allBooks.map((b) => ({
      id: b.id,
      title: b.title,
      imagePath: b.coverImage ?? ''
    }));
    // Pushing a placeholder (no elementHtml) would zip an empty book and
    // overwrite the real one on the remote — catastrophic in local-wins.
    // Filter pushContexts to books we actually hold content for.
    const pushContexts: ReplicationContext[] = allBooks
      .filter((b) => !!b.elementHtml)
      .map((b) => ({ id: b.id, title: b.title, imagePath: b.coverImage ?? '' }));

    logger.debug(
      `forceFullResync: direction=${direction}, ` +
        `pullContexts=${pullContexts.length}, pushContexts=${pushContexts.length}`
    );

    try {
      if (direction === 'newest' || direction === 'remote-wins') {
        logger.debug(`forceFullResync: pull ${location.kind} → local`);
        await replicateData({
          library: localEndpoint(),
          endpoint: endpointFor(location),
          direction: 'pull',
          refreshDataList: true,
          contexts: pullContexts,
          dataToReplicate: types,
          settings: pullSettings
        });
      }
      if (direction === 'newest' || direction === 'local-wins') {
        logger.debug(`forceFullResync: push local → ${location.kind}`);
        await replicateData({
          library: localEndpoint(),
          endpoint: endpointFor(location),
          direction: 'push',
          refreshDataList: true,
          contexts: pushContexts,
          dataToReplicate: types,
          settings: pushSettings
        });
      }
      markSynced();
    } catch (err) {
      reportSyncError('forceFullResync', err);
      throw err;
    }
  } finally {
    endLongRunning();
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
  return pushRunning || pending.size > 0 || pushTimer !== null || longRunningOps > 0;
}

// ---------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------

/**
 * Run once on app boot. Reconciles the connected sync location with
 * local IndexedDB. Safe to call multiple times — each invocation is
 * independent.
 */
export async function syncEngineStart(): Promise<void> {
  // Drain queued pushes when we come back online. Ambient pushes while
  // offline enqueue instead of erroring — this is where they flush.
  let wasOnline = isOnline$.getValue();
  isOnline$.subscribe((online) => {
    if (online && !wasOnline) {
      logger.debug('syncEngine: back online, draining replay queue');
      void drainReplayQueue();
    }
    wasOnline = online;
  });

  await reconcileBooksOnBoot();

  // Mirror the local library upward at every boot. Catches any books
  // the source is missing — including the post-importBackup reload
  // (where the in-flight ambient triggers were dropped by the reload)
  // and any other path that writes to the library without firing
  // triggerSync. isBookPresentAndUpToDate short-circuits the no-op
  // case, so the cost when nothing changed is one cheap check per
  // book.
  if (syncState.location) void pushAllLocalBooks();
}

/**
 * Called from the status indicator or reconnect flow after a user
 * gesture has restored auth. Re-runs the boot reconcile and drains
 * any push operations that were queued while auth was bad.
 */
export async function retryAfterReconnect(): Promise<void> {
  await reconcileBooksOnBoot();
  await drainReplayQueue();
}
