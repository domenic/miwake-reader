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

import type { BookStatistic } from '$lib/components/statistics/statistics-types';
import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import {
  cacheStorageData$,
  database,
  readingGoalsMergeMode$,
  replicationSaveBehavior$,
  statisticsMergeMode$
} from '$lib/data/store';
import { logger } from '$lib/data/logger';
import type { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import {
  checkCancelAndProgress,
  persistLibraryStorage,
  replicateData
} from '$lib/functions/replication/replicator';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import { throwIfAborted } from '$lib/functions/replication/replication-error';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import loadEpub from '$lib/functions/file-loaders/epub/load-epub';
import loadHtmlz from '$lib/functions/file-loaders/htmlz/load-htmlz';
import loadTxt from '$lib/functions/file-loaders/txt/load-txt';
import type { LoadData } from '$lib/functions/file-loaders/types';
import { getLocalEndpoint, getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import { StorageDataType, SyncEndpointType } from '$lib/data/storage/storage-types';
import { cloudSourceName, FS_SOURCE_NAME } from '$lib/data/sync/sync-helpers';
import { triggerSync } from '$lib/data/sync/sync-engine';
import { syncState, type SyncLocation } from '$lib/data/sync/sync-store.svelte';
import pLimit from 'p-limit';

// Reading goals are global rather than per-book; pendingKey only needs
// a stable, recognizable title for deduplication.
const READING_GOALS_CTX: ReplicationContext = { title: '<reading-goals>' };

/**
 * Look up a book by its local IDB id. The reader uses this on book
 * open; sync-engine reconciliation happens separately via
 * `reconcileForBookOpen` so the open path can be local-fast.
 */
export function openBook(id: number): Promise<BooksDbBookData | undefined> {
  return database.getData(id);
}

/**
 * Stamp a book row's `lastBookOpen` and persist the whole row to IDB.
 * Doesn't trigger a sync — `lastBookOpen` is treated as device-local
 * (the next ambient push will pick it up alongside any real edit).
 */
export async function markBookOpened(book: BooksDbBookData): Promise<void> {
  const db = await database.db;
  await db.put('data', book);
}

function endpointForCurrentLocation(location: SyncLocation) {
  const settings = { cacheStorageData: cacheStorageData$.getValue() };
  if (location.kind === 'cloud') {
    const name = cloudSourceName(location.provider, location.usesCustomCredentials);
    return location.provider === SyncEndpointType.GDRIVE
      ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, name, settings)
      : getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, name, settings);
  }
  return getSyncEndpoint(window, SyncEndpointType.FS, FS_SOURCE_NAME, settings);
}

/**
 * Import books the user picked from the file picker (or dropped on
 * /manage). Each successfully-loaded book is saved to the local
 * library and the DATA sync is triggered so the new content
 * propagates to the connected sync location. Cover ships bundled
 * with the DATA push.
 *
 * `fileCountData` is the manage page's character-counting trick:
 * when present, files are loaded only to count characters, not
 * saved, and a counts JSON is auto-downloaded at the end.
 *
 * Returns an aggregated error message string (or empty on success);
 * mirrors the legacy importData contract the manage page already
 * handled.
 */
export async function userImportBooks(
  document: Document,
  files: File[],
  cancelSignal: AbortSignal,
  fileCountData?: Record<string, number>
): Promise<string> {
  const local = getLocalEndpoint({ cacheStorageData: cacheStorageData$.getValue() });
  const importScopedSettings = {
    saveBehavior: replicationSaveBehavior$.getValue(),
    statisticsMergeMode: statisticsMergeMode$.getValue(),
    readingGoalsMergeMode: readingGoalsMergeMode$.getValue()
  };

  const dataIds: number[] = [];
  const tasks: Promise<void>[] = [];
  const lastBookModified = new Date().getTime();
  const progressBase = 3; // load -> save -> cover
  const maxProgress = progressBase * files.length;
  const limiter = pLimit(1);

  let errorMessage = '';

  replicationProgress$.next({ progressBase, maxProgress });
  await persistLibraryStorage();

  if (local.isCacheDisabled()) {
    local.clearData();
  }

  let newFileData = 0;

  files.forEach((file) =>
    tasks.push(
      limiter(async () => {
        let currentTitle = file.name;

        if (fileCountData && Object.prototype.hasOwnProperty.call(fileCountData, currentTitle)) {
          checkCancelAndProgress(cancelSignal, true, true);
          checkCancelAndProgress(cancelSignal, true, true);
          checkCancelAndProgress(cancelSignal, true, true);
          return;
        }

        try {
          throwIfAborted(cancelSignal);

          let bookContent: LoadData;
          if (file.name.endsWith('.epub')) {
            bookContent = await loadEpub(file, document, lastBookModified);
          } else if (file.name.endsWith('.txt')) {
            bookContent = await loadTxt(file, lastBookModified);
          } else {
            bookContent = await loadHtmlz(file, document, lastBookModified);
          }

          if (fileCountData) {
            fileCountData[currentTitle] = bookContent.characters;
            checkCancelAndProgress(cancelSignal, true, true);
            checkCancelAndProgress(cancelSignal, true, true);
            checkCancelAndProgress(cancelSignal, true, true);
            newFileData += 1;
            return;
          }

          checkCancelAndProgress(cancelSignal, true, true);

          currentTitle = bookContent.title;

          const scoped = local.scoped(
            { title: bookContent.title, imagePath: bookContent.coverImage || '' },
            importScopedSettings,
            cancelSignal
          );

          const dataId = await scoped.saveBook(bookContent, false);
          dataIds.push(dataId);

          checkCancelAndProgress(cancelSignal, false);

          if (bookContent.coverImage) {
            await scoped.saveCover(bookContent.coverImage);
          }

          // Pair the local write with a DATA trigger so the imported
          // book reaches the connected sync location ambiently. Cover
          // ships bundled with the DATA push.
          triggerSync(StorageDataType.DATA, {
            id: dataId,
            title: bookContent.title,
            imagePath: bookContent.coverImage
          });

          // The library always drives /manage's view; emit unconditionally.
          database.dataListChanged$.next();

          checkCancelAndProgress(cancelSignal, true, !bookContent.coverImage);
        } catch (error: any) {
          errorMessage = handleErrorDuringReplication(error, `Error importing ${currentTitle}: `, [
            limiter
          ]);
        }
      })
    )
  );

  await Promise.all(tasks).catch(() => {});

  if (fileCountData && newFileData) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(fileCountData)], { type: 'application/json' })
    );
    a.rel = 'noopener';
    a.download = 'characters';

    setTimeout(() => {
      URL.revokeObjectURL(a.href);
    }, 1e4);

    setTimeout(() => {
      a.click();
    });
  }

  return errorMessage;
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
 * trigger STATISTICS sync. Use from the reader's completion path.
 */
export async function userSaveStatistics(
  bookTitle: string,
  data: BooksDbStatistic[],
  saveBehavior: ReplicationSaveBehavior,
  mergeMode: MergeMode,
  context: ReplicationContext,
  lastStatisticModified?: number
): Promise<void> {
  await database.storeStatistics(bookTitle, data, saveBehavior, mergeMode, lastStatisticModified);
  triggerSync(StorageDataType.STATISTICS, context);
}

/**
 * Update a single statistic row (used by /statistics' edit dialog)
 * and trigger STATISTICS sync.
 */
export async function userUpdateStatistic(statistic: BookStatistic): Promise<void> {
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

  const local = getLocalEndpoint({ cacheStorageData: cacheStorageData$.getValue() });
  const handler = endpointForCurrentLocation(location);
  const contexts: ReplicationContext[] = bookTitles.map((title) => ({ title }));
  // Force-replace semantics: source.getFilenameForRecentCheck returns
  // undefined under Overwrite, so the up-to-date check short-circuits;
  // 'replace' on the target keeps the cloud handler from
  // merging the empty array back into its existing populated file.
  const deletePushSettings = {
    saveBehavior: ReplicationSaveBehavior.Overwrite,
    statisticsMergeMode: 'replace' as const,
    readingGoalsMergeMode: readingGoalsMergeMode$.getValue()
  };
  try {
    const error = await replicateData({
      library: local,
      endpoint: handler,
      direction: 'push',
      refreshDataList: false,
      contexts,
      dataToReplicate: [StorageDataType.STATISTICS],
      sourceSettings: deletePushSettings,
      targetSettings: deletePushSettings
    });
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
      // Cloud / FS handlers don't take keepLocalStatistics — that flag
      // is local-side only (controls whether stats rows survive after
      // the book row goes). Deleting the remote book folder removes
      // every file inside it regardless.
      await handler.deleteBookData(titles, cancelSignal);
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
