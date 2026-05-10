/**
 * The user-facing book library — what UI handlers (reader, /manage,
 * /settings) talk to when they want to mutate the user's data.
 *
 * Distinct from `LocalReplicationEndpoint` (the replicator's local
 * adapter at lib/data/storage/handler/local-replication-endpoint.ts):
 * that's the BookOperations peer of GDrive/OneDrive/FS handlers, used
 * by the replicator's pull/push paths and intentionally sync-naive
 * (a triggerSync there would loop pulls back to the remote).
 *
 * Every mutation here pairs the local IDB write with a triggerSync
 * (or, for deletes, a direct call to the connected endpoint's
 * deleteBookData) so the data reaches the user's other devices
 * without any individual call-site needing to remember both halves.
 *
 * UI call sites should never reach into `database.*` mutating methods
 * directly — that's how the import / backup-import / reading-goal /
 * book-delete / stat-delete trigger-after-write bugs slipped through.
 */

import type {
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import { database } from '$lib/data/store';
import { logger } from '$lib/data/logger';
import { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { replicateData } from '$lib/functions/replication/replicator';
import { getLocalEndpoint, getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import { StorageDataType, SyncEndpointType } from '$lib/data/storage/storage-types';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import { cloudSourceName, FS_SOURCE_NAME } from '$lib/data/sync/sync-helpers';
import { triggerSync } from '$lib/data/sync/sync-engine';
import { syncState, type SyncLocation } from '$lib/data/sync/sync-store.svelte';

// Reading goals are global rather than per-book; pendingKey only needs
// a stable, recognizable title for deduplication.
const READING_GOALS_CTX: ReplicationContext = { title: '<reading-goals>' };

interface EndpointSettings {
  saveBehavior?: ReplicationSaveBehavior;
  statisticsMergeMode?: MergeMode;
  readingGoalsMergeMode?: MergeMode;
  cacheStorageData?: boolean;
}

function endpointForCurrentLocation(location: SyncLocation, settings?: EndpointSettings) {
  if (location.kind === 'cloud') {
    const name = cloudSourceName(location.provider, location.usesCustomCredentials);
    return location.provider === SyncEndpointType.GDRIVE
      ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, name, settings)
      : getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, name, settings);
  }
  return getSyncEndpoint(window, SyncEndpointType.FS, FS_SOURCE_NAME, settings);
}

/**
 * Save (or replace) a bookmark and ambient-push it to the connected
 * sync location. Use from the reader's bookmark / scroll / completion
 * handlers.
 */
export async function userSaveBookmark(
  data: BooksDbBookmarkData,
  context: ReplicationContext
): Promise<void> {
  await database.putBookmark(data);
  triggerSync(StorageDataType.PROGRESS, context);
}

/**
 * Persist accumulated reading-session statistics for a book and
 * trigger STATISTICS sync. Use from the reader's tracker flush /
 * completion paths.
 */
export async function userSaveStatistics(
  bookTitle: string,
  data: BooksDbStatistic[],
  saveBehavior: ReplicationSaveBehavior,
  mergeMode: MergeMode,
  context: ReplicationContext
): Promise<void> {
  await database.storeStatistics(bookTitle, data, saveBehavior, mergeMode);
  triggerSync(StorageDataType.STATISTICS, context);
}

/**
 * Update a single statistic row (used by /statistics' edit dialog)
 * and trigger STATISTICS sync.
 */
export async function userUpdateStatistic(statistic: BooksDbStatistic): Promise<void> {
  await database.updateStatistic(statistic);
  triggerSync(StorageDataType.STATISTICS, { title: statistic.title });
}

/**
 * Bulk-delete statistics across one or more books, optionally
 * narrowed to a date range. Pushes the now-empty stats to the
 * connected sync endpoint synchronously with Overwrite +
 * MergeMode.NEWEST so the cloud's pre-existing populated file is
 * replaced rather than merged-with-empty (a no-op that would leave
 * the deleted stats hanging on the user's other devices).
 */
export async function userDeleteStatisticEntries(
  bookTitles: string[],
  checkExistingData: boolean,
  startDateString = '',
  endDateString = ''
): Promise<void> {
  await database.deleteStatisticEntries(
    bookTitles,
    checkExistingData,
    startDateString,
    endDateString
  );

  const location = syncState.location;
  if (!location || !bookTitles.length) return;

  // Force-replace semantics: source.getFilenameForRecentCheck returns
  // undefined under Overwrite, so the up-to-date check short-circuits;
  // MergeMode.NEWEST on the target keeps the cloud handler from
  // merging the empty array back into its existing populated file.
  const overrides = {
    saveBehavior: ReplicationSaveBehavior.Overwrite,
    statisticsMergeMode: MergeMode.NEWEST
  };
  const local = getLocalEndpoint(overrides);
  const handler = endpointForCurrentLocation(location, overrides);
  const contexts: ReplicationContext[] = bookTitles.map((title) => ({ title }));
  try {
    const error = await replicateData(local, handler, 'push', false, contexts, [
      StorageDataType.STATISTICS
    ]);
    if (error) {
      logger.warn(`userDeleteStatisticEntries: remote push reported "${error}"`);
    }
  } catch (err) {
    logger.warn(
      `userDeleteStatisticEntries: remote push failed (${err instanceof Error ? err.message : String(err)}); ` +
        'local rows are gone but other devices may still see the deleted stats until next force-resync.'
    );
  }
}

/**
 * Save a new / changed reading goal (and optionally retire previous
 * goals via the same atomic IDB transaction) and trigger
 * READING_GOALS sync.
 */
export async function userSaveReadingGoals(
  toDelete: string[],
  toInsert: BooksDbReadingGoal[]
): Promise<void> {
  await database.updateReadingGoals(toDelete, toInsert);
  triggerSync(StorageDataType.READING_GOALS, READING_GOALS_CTX);
}

/**
 * Delete a reading goal (or, when given undefined, all stored goals)
 * and trigger READING_GOALS sync so the deletion replaces the
 * previous file on the remote.
 */
export async function userDeleteReadingGoal(date: string | undefined): Promise<void> {
  await database.deleteReadingGoal(date);
  triggerSync(StorageDataType.READING_GOALS, READING_GOALS_CTX);
}

/**
 * Delete one or more books from the user's library — locally AND on
 * the connected sync endpoint. Without the remote leg, boot
 * reconcileBooksOnBoot would see the book in the remote listing and
 * recreate the placeholder, silently undoing the user's deletion.
 *
 * Local deletion always runs. Remote deletion is best-effort: a
 * remote failure is logged but doesn't undo the local delete (the
 * user already accepted "remove this book"; partial completion is
 * still a forward step).
 */
export async function userDeleteBooks(
  titles: string[],
  cancelSignal: AbortSignal,
  keepLocalStatistics: boolean
): Promise<{ error: string; deleted: number[] }> {
  const local = getLocalEndpoint();
  const result = await local.deleteBookData(titles, cancelSignal, keepLocalStatistics);

  const location = syncState.location;
  if (location && titles.length) {
    try {
      const handler = endpointForCurrentLocation(location);
      await handler.deleteBookData(titles, cancelSignal, keepLocalStatistics);
    } catch (err) {
      logger.warn(
        `userDeleteBooks: remote-side delete failed (${err instanceof Error ? err.message : String(err)}); ` +
          'local rows are gone but the next reconcile may recreate placeholders for them. ' +
          'Run Force re-sync · This device wins to push the deletion.'
      );
    }
  }

  return result;
}
