import type { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import type { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';
import type { Library, SyncEndpoint } from '$lib/data/storage/handler/handler-roles';
import { NeedsInteractiveAuthError, NeedsPermissionGrantError } from '$lib/data/storage/errors';
import { StorageDataType, SyncEndpointType, type SyncTitle } from '$lib/data/storage/storage-types';
import { getLibrary, getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
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
  isOnline$,
  readingGoalsMergeMode$,
  replicationSaveBehavior$,
  statisticsMergeMode$
} from '$lib/data/store';
import {
  isSyncing$,
  syncHealth$,
  syncLocation$,
  type SyncLocation
} from '$lib/data/sync/sync-store';
import { cloudSourceName, FS_SOURCE_NAME, readSubject as read } from '$lib/data/sync/sync-helpers';
import { logger } from '$lib/data/logger';
import { get } from 'svelte/store';

// ---------------------------------------------------------------------
// Handler factories
// ---------------------------------------------------------------------

/**
 * `saveBehaviorOverride` is how force-resync breaks the replicator's
 * "skip if up-to-date" check. Set on the *source* of a given leg
 * (library for push, endpoint for pull): when saveBehavior ===
 * Overwrite, getFilenameForRecentCheck returns undefined, the
 * target's isPresentAndUpToDate returns false, and the pull/push
 * always runs.
 */
function commonSettings(saveBehaviorOverride?: ReplicationSaveBehavior) {
  return {
    saveBehavior: saveBehaviorOverride ?? read<ReplicationSaveBehavior>(replicationSaveBehavior$),
    statisticsMergeMode: read<MergeMode>(statisticsMergeMode$),
    readingGoalsMergeMode: read<MergeMode>(readingGoalsMergeMode$),
    cacheStorageData: read<boolean>(cacheStorageData$),
    askForStorageUnlock: false
  };
}

/** Build the SyncEndpoint for whatever location is currently
 *  configured. Returns null if no location is connected. */
function endpointFor(
  location: SyncLocation,
  saveBehaviorOverride?: ReplicationSaveBehavior
): SyncEndpoint {
  const settings = commonSettings(saveBehaviorOverride);
  if (location.kind === 'cloud') {
    const name = cloudSourceName(location.provider, location.usesCustomCredentials);
    return location.provider === SyncEndpointType.GDRIVE
      ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, name, settings)
      : getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, name, settings);
  }
  return getSyncEndpoint(window, SyncEndpointType.FS, FS_SOURCE_NAME, settings);
}

function library(saveBehaviorOverride?: ReplicationSaveBehavior): Library {
  return getLibrary(commonSettings(saveBehaviorOverride));
}

// ---------------------------------------------------------------------
// Connection-state updates
// ---------------------------------------------------------------------

function patchLocation(patch: Partial<SyncLocation>): void {
  const current = read<SyncLocation | null>(syncLocation$);
  if (!current) return;
  syncLocation$.next({ ...current, ...patch } as SyncLocation);
}

function markSynced(extra: Partial<SyncLocation> = {}): void {
  patchLocation({ lastSyncedAt: Date.now(), ...extra });
  syncHealth$.next({ status: 'ok' });
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
    syncHealth$.next({
      status: 'reauth-required',
      summary: 'Sign-in expired',
      detail: 'Reconnect to resume syncing. Queued changes will be pushed on reconnect.'
    });
    return true;
  }

  if (err instanceof NeedsPermissionGrantError) {
    syncHealth$.next({
      status: 'permission-required',
      summary: 'Filesystem access needed',
      detail:
        'Grant access to your sync folder to resume syncing. Queued changes will be pushed once granted.'
    });
    return true;
  }

  logger.warn(`sync ${context} failed: ${message}`);
  syncHealth$.next({ status: 'error', summary: 'Sync failed', detail: message });
  return false;
}

// ---------------------------------------------------------------------
// Placeholder reconciliation
// ---------------------------------------------------------------------

/**
 * Given a list of titles from the sync location, write a placeholder
 * row into local IndexedDB for any title that isn't already present,
 * and refresh the cover on existing placeholders (cloud thumbnail
 * URLs are session-scoped, so we re-store the fresh one each
 * reconcile). Returns the count of rows touched.
 */
export async function ensurePlaceholders(remoteCards: ReadonlyArray<SyncTitle>): Promise<number> {
  let touched = 0;
  const db = await database.db;

  for (const card of remoteCards) {
    const existing = await database.getDataByTitle(card.title);

    if (existing) {
      // Already-downloaded books get their cover via the full content
      // pull; only placeholders need their cover refreshed here.
      if (!existing.elementHtml && card.coverImage && existing.coverImage !== card.coverImage) {
        await db.put('data', { ...existing, coverImage: card.coverImage });
        touched += 1;
      }
      // Refresh the placeholder bookmark so /manage's progress / bookmarked
      // sort reflects what the source currently advertises. Real bookmarks
      // (placeholder !== true) are off-limits — they represent the user's
      // actual reading position and are reconciled by the replicator.
      if (!existing.elementHtml) {
        const bookmark = await database.getBookmark(existing.id);
        if (!bookmark || bookmark.placeholder) {
          await maybeWritePlaceholderBookmark(existing.id, card, bookmark);
        }
      }
      continue;
    }

    logger.debug(
      `ensurePlaceholders: no local record for ${JSON.stringify(card.title)}, creating placeholder`
    );

    const stored = await database.upsertData(
      {
        title: card.title,
        elementHtml: '',
        styleSheet: '',
        blobs: {},
        coverImage: card.coverImage || '',
        hasThumb: !!card.coverImage,
        characters: card.characters || 0,
        sections: [],
        lastBookModified: card.lastBookModified || 0,
        lastBookOpen: card.lastBookOpen || 0
      },
      ReplicationSaveBehavior.NewOnly
    );
    await maybeWritePlaceholderBookmark(stored.id, card);
    touched += 1;
  }

  return touched;
}

async function maybeWritePlaceholderBookmark(
  dataId: number,
  card: SyncTitle,
  existing?: { progress: number | string | undefined; lastBookmarkModified: number }
) {
  if (!card.lastBookmarkModified && !card.progress && !card.completed) {
    // Source has no progress file for this title — nothing to seed.
    return;
  }
  if (
    existing &&
    existing.progress === (card.progress ?? 0) &&
    existing.lastBookmarkModified === (card.lastBookmarkModified ?? 0)
  ) {
    // Already in sync with what the source advertises.
    return;
  }
  await database.putBookmark({
    dataId,
    progress: card.progress ?? 0,
    lastBookmarkModified: card.lastBookmarkModified ?? 0,
    completed: !!card.completed,
    placeholder: true
  });
}

/**
 * Apply a remote book list to local state: seed placeholders for every
 * remote-listed title, prune ones the source didn't list. Used after
 * the caller has confirmed the source is reachable (boot reconcile,
 * fresh connect, switch, force resync) so failures here only affect
 * the new connection.
 */
export async function reconcilePlaceholders(books: SyncTitle[]): Promise<void> {
  const ensured = await ensurePlaceholders(books);
  const reachable = new Set(books.map((b) => b.title));
  const pruned = await pruneUnreachablePlaceholders(reachable);
  if (ensured > 0 || pruned > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * Drop placeholder rows whose titles aren't in `reachableTitles`. The
 * cascade-delete via database.deleteData also clears companion
 * bookmark / lastItem rows. Pass an empty set to drop all placeholders
 * (used by disconnect, since the single-location model has no
 * remaining source to fall back on).
 */
export async function pruneUnreachablePlaceholders(reachableTitles: Set<string>): Promise<number> {
  const db = await database.db;
  const allBooks = await db.getAll('data');

  const ids: number[] = [];
  const idsToTitles = new Map<number, string>();
  for (const book of allBooks) {
    if (!book.elementHtml && !reachableTitles.has(book.title)) {
      ids.push(book.id);
      idsToTitles.set(book.id, book.title);
    }
  }
  if (ids.length === 0) return 0;

  // Defer to database.deleteData so every related store is cleaned up
  // in one transaction: bookmark (placeholder bookmarks since the
  // placeholder-bookmark commit), lastItem (if the user opened this
  // placeholder, b/+page.svelte writes lastItem), statistic /
  // lastModified (only present for hydrated books, skipped via
  // keepLocalStatistics here as a no-op safety belt).
  const { deleted } = await database.deleteData(
    ids,
    idsToTitles,
    new AbortController().signal,
    /* keepLocalStatistics */ true
  );
  return deleted.length;
}

/**
 * Boot-time reconciliation: pull the title list from the configured
 * sync location and reconcile local placeholders. Silent auth (cloud)
 * / silent permission (FS); failures surface via syncHealth$. No-op
 * if no location is connected.
 */
export async function reconcileBooksOnBoot(): Promise<void> {
  const location = read<SyncLocation | null>(syncLocation$);
  if (!location) return;

  const handler = endpointFor(location);

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      // Cast: we built handler from a cloud location, so it's the
      // OAuth-flavored variant. Other endpoint kinds don't have authenticate().
      await (handler as GDriveStorageHandler | OneDriveStorageHandler).authenticate(null, true);
    }

    const remoteBooks = await handler.listSyncTitles();
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
  const direction = read<AutoReplicationType>(autoReplication$);
  if (direction === AutoReplicationType.Off || direction === AutoReplicationType.Down) return;

  const location = read<SyncLocation | null>(syncLocation$);
  if (!location) return;

  const key = pendingKey(context);
  const existing = pending.get(key);
  if (existing) {
    existing.types.add(dataType);
  } else {
    pending.set(key, { context, types: new Set([dataType]) });
  }

  isSyncing$.set(true);
  schedulePushRun();
}

/**
 * Schedule ambient pushes for every locally-downloaded book. Called
 * from connect flows so existing library content propagates to the
 * newly-attached location: ambient sync only fires on local edits, so
 * a freshly-connected (and possibly empty) location would otherwise
 * stay empty until the user happened to bookmark something.
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
  if (get(isSyncing$) !== active) isSyncing$.set(active);
}

async function pushOne(context: ReplicationContext, types: StorageDataType[]): Promise<void> {
  const location = read<SyncLocation | null>(syncLocation$);
  if (!location) return;

  if (location.kind === 'cloud' && !read<boolean>(isOnline$)) {
    // Offline — queue for replay and leave syncHealth$ alone so the
    // indicator shows the offline state rather than a spurious
    // "Sync failed" error on every edit.
    logger.debug(`push: offline, queueing cloud push for ${JSON.stringify(context.title)}`);
    enqueueReplay(() => pushOne(context, types));
    return;
  }

  const local = library();
  const handler = endpointFor(location);

  try {
    if (location.kind === 'cloud') {
      await (handler as GDriveStorageHandler | OneDriveStorageHandler).authenticate(null, true);
    }
    const error = await replicateData(local, handler, 'push', false, [context], types);
    if (error) throw new Error(error);
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
    } catch (err) {
      logger.warn(`replay failed: ${err instanceof Error ? err.message : String(err)}`);
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
  const direction = read<AutoReplicationType>(autoReplication$);
  if (direction !== AutoReplicationType.Down && direction !== AutoReplicationType.All) {
    logger.debug(
      `reconcileForBookOpen: skipping (autoReplication=${direction}) for ${JSON.stringify(context.title)}`
    );
    return;
  }

  const location = read<SyncLocation | null>(syncLocation$);
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
  const local = library();
  const handler = endpointFor(location);
  logger.debug(
    `reconcileForBookOpen: start for ${JSON.stringify(context.title)} ` +
      `(location=${location.kind}, isPlaceholder=${isPlaceholder}, types=[${types.join(',')}])`
  );

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      logger.debug('reconcileForBookOpen: cloud authenticate (silent)');
      await (handler as GDriveStorageHandler | OneDriveStorageHandler).authenticate(null, true);
    }
    const error = await replicateData(local, handler, 'pull', false, [context], types);
    if (error) throw new Error(error);
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
  const location = read<SyncLocation | null>(syncLocation$);
  if (!location) throw new Error('No sync location connected.');

  const types = [
    StorageDataType.DATA,
    StorageDataType.PROGRESS,
    StorageDataType.STATISTICS,
    StorageDataType.READING_GOALS
  ];

  // In a winner-takes-all direction, override the *source* handler's
  // saveBehavior to Overwrite so replicator's getFilenameForRecentCheck
  // returns undefined, the target's isPresentAndUpToDate returns false,
  // and the pull/push always runs instead of short-circuiting on a
  // local-newer timestamp. 'newest' keeps the default (NewOnly) so the
  // per-item wins-by-timestamp behavior is preserved.
  const pullSourceOverride: ReplicationSaveBehavior | undefined =
    direction === 'remote-wins' ? ReplicationSaveBehavior.Overwrite : undefined;
  const pushSourceOverride: ReplicationSaveBehavior | undefined =
    direction === 'local-wins' ? ReplicationSaveBehavior.Overwrite : undefined;

  beginLongRunning();
  try {
    if (location.kind === 'cloud') {
      try {
        await (endpointFor(location) as GDriveStorageHandler | OneDriveStorageHandler).authenticate(
          null,
          true
        );
      } catch (err) {
        reportSyncError('forceFullResync (auth)', err);
        throw err;
      }
    }

    // Reconcile placeholders against the current remote listing
    // first — otherwise the loops below iterate stale local `data`
    // and miss remote-only books or waste cycles on remote-deleted
    // ones. clearData() because handlers are module-level singletons
    // whose listing cache outlives the user's last edit.
    const handler = endpointFor(location);
    handler.clearData();
    const remoteBooks = await handler.listSyncTitles();
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
        `pullContexts=${pullContexts.length}, pushContexts=${pushContexts.length}, ` +
        `pullOverride=${pullSourceOverride ?? 'default'}, pushOverride=${pushSourceOverride ?? 'default'}`
    );

    try {
      if (direction === 'newest' || direction === 'remote-wins') {
        const remote = endpointFor(location, pullSourceOverride);
        logger.debug(`forceFullResync: pull ${location.kind} → local`);
        const error = await replicateData(library(), remote, 'pull', true, pullContexts, types);
        if (error) throw new Error(error);
      }
      if (direction === 'newest' || direction === 'local-wins') {
        // Push: library is source, saveBehavior override applies to it.
        const localSource = library(pushSourceOverride);
        const remote = endpointFor(location);
        logger.debug(`forceFullResync: push local → ${location.kind}`);
        const error = await replicateData(localSource, remote, 'push', true, pushContexts, types);
        if (error) throw new Error(error);
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
  let wasOnline = read<boolean>(isOnline$);
  isOnline$.subscribe((online) => {
    if (online && !wasOnline) {
      logger.debug('syncEngine: back online, draining replay queue');
      void drainReplayQueue();
    }
    wasOnline = online;
  });

  await reconcileBooksOnBoot();
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
