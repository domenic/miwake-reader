import type {
  LocalReplicationEndpoint,
  ScopedSettings,
  SyncEndpoint
} from '$lib/data/storage/handler/handler-roles';
import { NeedsInteractiveAuthError, NeedsPermissionGrantError } from '$lib/data/storage/errors';
import { StorageDataType, SyncEndpointType, type SyncTitle } from '$lib/data/storage/storage-types';
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
import {
  markBookMirroredToSource,
  reconcileAfterAuthoritativeListing
} from '$lib/data/sync/placeholder-reconciler';
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
 * statistics / reading-goal delete pushes. Default
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

  // reconcileAfterAuthoritativeListing treats the remote listing as
  // authoritative — placeholders and books last seen on this source
  // but missing from the listing get pruned. Skip when the user has
  // opted out of pulling remote state into local:
  //   - `Off`: sync is off entirely; nothing to do.
  //   - `Up`: push-only; the post-boot push will mirror any local
  //     book up to the source even if it's currently absent there,
  //     so we must NOT prune the local copy first.
  if (!isPullAllowed()) return;

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
    await reconcileAfterAuthoritativeListing(remoteBooks, location.sourceInstanceId);

    markSynced(location.kind === 'cloud' ? { bookCount: remoteBooks.length } : {});
    await drainReplayQueue();
  } catch (err) {
    reportSyncError('reconcileBooksOnBoot', err);
  } finally {
    endLongRunning();
  }
}

// ---------------------------------------------------------------------
// Local mutation mirroring (local → connected location)
//
// syncAfterLocalMutation() is the single user-facing write boundary:
// library/UI code performs the local IDB mutation, then reports what
// changed here. The engine applies direction policy and endpoint
// details in one place so `Down` / `Off` cannot accidentally leak a
// remote delete or push through a bespoke call site.
//
// Per-book saves coalesce into a single debounced push. Deletes are
// immediate and force-replace where merging would resurrect rows.
// Silent auth — if the cached refresh token is stale, recoverable
// pushes are queued for replay after the user reconnects.
// ---------------------------------------------------------------------

const PUSH_DEBOUNCE_MS = 5000;

/** Safety rail on the reauth-replay queue. Well above any realistic
 *  edit rate during a single disconnected session; prevents runaway
 *  memory growth if the user's auth stays broken indefinitely. */
const REPLAY_QUEUE_MAX = 500;

/**
 * Per-book ambient pushes are keyed by title and carry a set of
 * StorageDataTypes (DATA / PROGRESS / STATISTICS — anything that
 * lives on a specific book). Reading goals are library-scoped, not
 * per-book, so they don't fit this shape; they're tracked
 * separately by `pendingGoalsPush` to avoid forcing a synthetic
 * "book context" through the per-book pipeline.
 */
type BookDataType = StorageDataType.DATA | StorageDataType.PROGRESS | StorageDataType.STATISTICS;

interface PendingPush {
  context: ReplicationContext;
  types: Set<BookDataType>;
}

export type LocalMutationSync =
  | { kind: 'book-data'; context: ReplicationContext }
  | { kind: 'progress'; context: ReplicationContext }
  | { kind: 'statistics'; context: ReplicationContext }
  | { kind: 'reading-goals' }
  | { kind: 'books-deleted'; titles: string[]; cancelSignal: AbortSignal }
  | { kind: 'statistics-deleted'; titles: string[] }
  | { kind: 'reading-goals-deleted' };

let pending: Map<string, PendingPush> = new Map();
let pendingGoalsPush = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushRunning = false;
const canceledBookPushTitles = new Set<string>();
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

/**
 * Report a user-facing local mutation to the sync engine. The local
 * write has already completed; this function mirrors the mutation to
 * the connected source if the active sync direction allows upward
 * changes.
 */
export function syncAfterLocalMutation(mutation: LocalMutationSync): void | Promise<void> {
  switch (mutation.kind) {
    case 'book-data':
      return queueBookPush(StorageDataType.DATA, mutation.context);
    case 'progress':
      return queueBookPush(StorageDataType.PROGRESS, mutation.context);
    case 'statistics':
      return queueBookPush(StorageDataType.STATISTICS, mutation.context);
    case 'reading-goals':
      return queueGoalsPush();
    case 'books-deleted':
      return deleteRemoteBooks(mutation.titles, mutation.cancelSignal);
    case 'statistics-deleted':
      return pushDeletedStatistics(mutation.titles);
    case 'reading-goals-deleted':
      return pushDeletedReadingGoals();
  }
}

/**
 * Queue an ambient push for a specific book — DATA, PROGRESS, or
 * STATISTICS. Multiple triggers for the same book within the
 * debounce window coalesce into one push of the union of types.
 * For library-scoped reading goals use `queueGoalsPush()` instead.
 */
function queueBookPush(dataType: BookDataType, context: ReplicationContext): void {
  if (!isPushAllowed()) return;
  const key = pendingKey(context);
  if (dataType === StorageDataType.DATA) {
    canceledBookPushTitles.delete(key);
  } else if (canceledBookPushTitles.has(key)) {
    return;
  }
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
 * Queue an ambient push of the user's reading goals. Goals are
 * library-scoped (one file at the source root), so they don't carry
 * a per-book context — repeated calls within the debounce window
 * coalesce into one push.
 */
function queueGoalsPush(): void {
  if (!isPushAllowed()) return;
  pendingGoalsPush = true;
  syncState.isSyncing = true;
  schedulePushRun();
}

function isPushAllowed(): boolean {
  const direction = autoReplication$.getValue();
  if (direction === AutoReplicationType.Off || direction === AutoReplicationType.Down) return false;
  if (!syncState.location) return false;
  return true;
}

function isPullAllowed(): boolean {
  const direction = autoReplication$.getValue();
  return direction === AutoReplicationType.Down || direction === AutoReplicationType.All;
}

function cancelBookPushes(titles: string[]): void {
  if (!titles.length) return;
  for (const title of titles) {
    pending.delete(title);
    canceledBookPushTitles.add(title);
  }
  if (pending.size === 0 && !pendingGoalsPush && pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  emitSyncingState();
}

/**
 * Schedule ambient pushes for every locally-downloaded book. Called
 * from connect flows so existing library content propagates to the
 * newly-attached location: ambient sync only fires on local edits
 * via syncAfterLocalMutation, so a freshly-connected (and possibly empty)
 * location would otherwise stay missing every book the user already
 * has — bookmark/edit triggers only fire PROGRESS/STATISTICS for the
 * touched book, never DATA.
 *
 * Placeholders (no elementHtml) are skipped — they have nothing to
 * push.
 */
async function pushAllLocalBooks(): Promise<void> {
  const db = await database.db;
  const all = await db.getAll('data');
  for (const book of all) {
    if (!book.elementHtml) continue;
    const context: ReplicationContext = {
      id: book.id,
      title: book.title,
      imagePath: book.coverImage || ''
    };
    queueBookPush(StorageDataType.DATA, context);
    queueBookPush(StorageDataType.PROGRESS, context);
    queueBookPush(StorageDataType.STATISTICS, context);
  }
  // Reading goals are library-scoped — without this, a fresh connect
  // with zero downloaded books (or only placeholders) would never
  // mirror the user's goals up to the new source.
  queueGoalsPush();
}

export async function syncAfterSourceConnected(): Promise<void> {
  if (!isPushAllowed()) return;
  await pushAllLocalBooks();
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
  if (pending.size === 0 && !pendingGoalsPush) {
    emitSyncingState();
    return;
  }

  const batch = pending;
  const runGoals = pendingGoalsPush;
  pending = new Map();
  pendingGoalsPush = false;
  pushRunning = true;
  emitSyncingState();

  try {
    for (const { context, types } of batch.values()) {
      await pushOne(context, [...types]);
    }
    if (runGoals) {
      await pushGoals();
    }
  } finally {
    pushRunning = false;
    if (pending.size > 0 || pendingGoalsPush) schedulePushRun();
    emitSyncingState();
  }
}

function emitSyncingState(): void {
  const active =
    pushRunning || pending.size > 0 || pendingGoalsPush || pushTimer !== null || longRunningOps > 0;
  if (syncState.isSyncing !== active) syncState.isSyncing = active;
}

async function pushOne(context: ReplicationContext, types: BookDataType[]): Promise<void> {
  if (canceledBookPushTitles.has(context.title)) return;

  const location = syncState.location;
  if (!location) return;
  // Snapshot the source identity BEFORE any await. If the user
  // switches sources mid-push, `markBookMirroredToSource` below will
  // see the mismatch and no-op rather than stamping the book with
  // the new source's id (which the push never wrote to).
  const expectedSourceInstanceId = location.sourceInstanceId;

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
    // The push reached the source we captured at function entry;
    // stamp the book with that id so a later reconcile can tell
    // remote-deleted from never-pushed. The stamp is guarded against
    // a mid-flight source switch via expectedSourceInstanceId.
    if (context.id && types.includes(StorageDataType.DATA)) {
      await markBookMirroredToSource(context.id, expectedSourceInstanceId);
    }
    markSynced();
  } catch (err) {
    const recoverable = reportSyncError('push', err);
    if (recoverable) enqueueReplay(() => pushOne(context, types));
  }
}

/**
 * Run a queued reading-goals push. Library-scoped — the replicator
 * pulls the goals straight from local IDB (no per-book context
 * needed) and writes a single goals file at the source root. Mirrors
 * pushOne's offline-queue + replay shape so an offline cloud
 * connection or a stale RT defers the push instead of dropping it.
 */
async function pushGoals(): Promise<void> {
  const location = syncState.location;
  if (!location) return;

  if (location.kind === 'cloud' && !isOnline$.getValue()) {
    logger.debug('push (goals): offline, queueing for replay');
    enqueueReplay(() => pushGoals());
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
      contexts: [],
      dataToReplicate: [StorageDataType.READING_GOALS],
      settings: scopedSettings()
    });
    markSynced();
  } catch (err) {
    const recoverable = reportSyncError('push (goals)', err);
    if (recoverable) enqueueReplay(() => pushGoals());
  }
}

async function deleteRemoteBooks(titles: string[], cancelSignal: AbortSignal): Promise<void> {
  cancelBookPushes(titles);

  const location = syncState.location;
  if (!titles.length || !location || !isPushAllowed()) return;

  if (location.kind === 'cloud' && !isOnline$.getValue()) {
    logger.debug(`delete books: offline, queueing for replay (${titles.length} title(s))`);
    enqueueReplay(() => deleteRemoteBooks([...titles], new AbortController().signal));
    return;
  }

  const handler = endpointFor(location);
  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      await handler.authenticate(null, true);
    }
    await handler.deleteBookData(titles, cancelSignal, false);
    markSynced();
  } catch (err) {
    const recoverable = reportSyncError('delete books', err);
    if (recoverable) {
      enqueueReplay(() => deleteRemoteBooks([...titles], new AbortController().signal));
    }
  } finally {
    endLongRunning();
  }
}

async function pushDeletedStatistics(titles: string[]): Promise<void> {
  const location = syncState.location;
  if (!titles.length || !location || !isPushAllowed()) return;

  if (location.kind === 'cloud' && !isOnline$.getValue()) {
    logger.debug(
      `push deleted statistics: offline, queueing for replay (${titles.length} title(s))`
    );
    enqueueReplay(() => pushDeletedStatistics([...titles]));
    return;
  }

  const contexts: ReplicationContext[] = titles.map((title) => ({ title }));
  const handler = endpointFor(location);

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      await handler.authenticate(null, true);
    }
    await replicateData({
      library: localEndpoint(),
      endpoint: handler,
      direction: 'push',
      refreshDataList: false,
      contexts,
      dataToReplicate: [StorageDataType.STATISTICS],
      settings: scopedSettings({ winnerTakesAll: true })
    });
    markSynced();
  } catch (err) {
    const recoverable = reportSyncError('push deleted statistics', err);
    if (recoverable) enqueueReplay(() => pushDeletedStatistics([...titles]));
  } finally {
    endLongRunning();
  }
}

async function pushDeletedReadingGoals(): Promise<void> {
  const location = syncState.location;
  if (!location || !isPushAllowed()) return;

  if (location.kind === 'cloud' && !isOnline$.getValue()) {
    logger.debug('push deleted reading goals: offline, queueing for replay');
    enqueueReplay(() => pushDeletedReadingGoals());
    return;
  }

  const handler = endpointFor(location);

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      await handler.authenticate(null, true);
    }
    await replicateData({
      library: localEndpoint(),
      endpoint: handler,
      direction: 'push',
      refreshDataList: false,
      contexts: [],
      dataToReplicate: [StorageDataType.READING_GOALS],
      settings: scopedSettings({ winnerTakesAll: true })
    });
    markSynced();
  } catch (err) {
    const recoverable = reportSyncError('push deleted reading goals', err);
    if (recoverable) enqueueReplay(() => pushDeletedReadingGoals());
  } finally {
    endLongRunning();
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
  if (!isPullAllowed()) {
    logger.debug(
      `reconcileForBookOpen: skipping (autoReplication=${autoReplication$.getValue()}) for ${JSON.stringify(context.title)}`
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

    // List the remote so the handler's in-memory state (root folder
    // info, listing cache) is warm; the subsequent push relies on it.
    // For `local-wins`, SKIP the reconcile step: the user has
    // explicitly asked to push local copies up, and
    // reconcileAfterAuthoritativeListing would prune local rows that
    // another device deleted from the remote BEFORE the push could
    // mirror them back — turning "this device wins" into data loss.
    const handler = endpointFor(location);
    const remoteBooks: SyncTitle[] = await handler.listSyncTitles({
      refresh: true,
      silentOnly: true
    });
    if (direction !== 'local-wins') {
      await reconcileAfterAuthoritativeListing(remoteBooks, location.sourceInstanceId);
    }

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
        // Stamp each pushed book with the source id captured when
        // this resync started — that's the source the push actually
        // wrote to. markBookMirroredToSource guards against a
        // mid-flight source switch by re-checking against the
        // current syncState before writing.
        for (const ctx of pushContexts) {
          if (ctx.id) await markBookMirroredToSource(ctx.id, location.sourceInstanceId);
        }
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
  return (
    pushRunning || pending.size > 0 || pendingGoalsPush || pushTimer !== null || longRunningOps > 0
  );
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
  // mutation notification. isBookPresentAndUpToDate short-circuits
  // the no-op case, so the cost when nothing changed is one cheap
  // check per book.
  void syncAfterSourceConnected();
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
