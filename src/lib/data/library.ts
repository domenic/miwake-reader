/**
 * The user-facing book library — what UI handlers (reader, /manage,
 * /settings) talk to when they want to mutate the user's data.
 *
 * Distinct from `LocalReplicationEndpoint` (the replicator's local
 * adapter at lib/data/storage/handler/local-replication-endpoint.ts):
 * that's the BookOperations peer of GDrive/OneDrive/FS handlers, used
 * by the replicator's pull/push paths and intentionally sync-naive
 * (a mutation notification there would loop pulls back to the remote).
 *
 * Every mutation here pairs the local IDB write with a
 * syncAfterLocalMutation call so the sync engine can apply direction
 * policy and endpoint details consistently.
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
import { database } from '$lib/data/store';
import type { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import {
  checkCancelAndProgress,
  persistLibraryStorage
} from '$lib/functions/replication/replicator';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import { AbortError, throwIfAborted } from '$lib/functions/replication/replication-error';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import loadEpub from '$lib/functions/file-loaders/epub/load-epub';
import loadHtmlz from '$lib/functions/file-loaders/htmlz/load-htmlz';
import loadTxt from '$lib/functions/file-loaders/txt/load-txt';
import type { LoadData } from '$lib/functions/file-loaders/types';
import { getLocalEndpoint } from '$lib/data/storage/storage-handler-factory';
import { scopedSettings, syncAfterLocalMutation } from '$lib/data/sync/sync-engine';
import pLimit from 'p-limit';

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
): Promise<void> {
  const local = getLocalEndpoint();
  const importScopedSettings = scopedSettings();

  const tasks: Promise<void>[] = [];
  const lastBookModified = new Date().getTime();
  const progressBase = 3; // load -> save -> cover
  const maxProgress = progressBase * files.length;
  const limiter = pLimit(1);

  const errors: Error[] = [];

  replicationProgress$.next({ progressBase, maxProgress });
  await persistLibraryStorage();

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

          checkCancelAndProgress(cancelSignal, false);

          if (bookContent.coverImage) {
            await scoped.saveCover(bookContent.coverImage);
          }

          // Pair the local write with a DATA mutation so the imported
          // book reaches the connected sync location ambiently. Cover
          // ships bundled with the DATA push.
          syncAfterLocalMutation({
            kind: 'book-data',
            context: {
              id: dataId,
              title: bookContent.title,
              imagePath: bookContent.coverImage
            }
          });

          // The library always drives /manage's view; emit unconditionally.
          database.dataListChanged$.next();

          checkCancelAndProgress(cancelSignal, true, !bookContent.coverImage);
        } catch (error: any) {
          handleErrorDuringReplication(error, `Error importing ${currentTitle}: `, [limiter]);
          errors.push(new Error(`Error importing ${currentTitle}: ${error.message}`));
        }
      })
    )
  );

  // AbortError gets re-thrown from inside the per-task try (via
  // handleErrorDuringReplication) and lands here as the rejection.
  // Re-throw so a cancel isn't disguised as a successful (partial)
  // import.
  await Promise.all(tasks).catch((err) => {
    if (err instanceof AbortError) throw err;
  });

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

  if (errors.length) {
    throw new AggregateError(errors, errors[0].message);
  }
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
  syncAfterLocalMutation({ kind: 'progress', context });
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
  syncAfterLocalMutation({ kind: 'statistics', context });
}

/**
 * Update a single statistic row (used by /statistics' edit dialog)
 * and trigger STATISTICS sync.
 */
export async function userUpdateStatistic(statistic: BookStatistic): Promise<void> {
  await database.updateStatistic(statistic);
  syncAfterLocalMutation({ kind: 'statistics', context: { title: statistic.title } });
}

/**
 * Bulk-delete statistics across one or more books, optionally
 * narrowed to a date range. The sync engine force-pushes the now-empty
 * stats when upward sync is enabled; ambient merge-mode would
 * otherwise merge the remote rows back.
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

  await syncAfterLocalMutation({ kind: 'statistics-deleted', titles: bookTitles });
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
  syncAfterLocalMutation({ kind: 'reading-goals' });
}

/**
 * Delete a reading goal (or, when given undefined, all stored goals).
 * Mirrors `userDeleteStatisticEntries`: the sync engine force-pushes
 * the empty / shrunken local set when upward sync is enabled.
 */
export async function userDeleteReadingGoal(date: string | undefined): Promise<void> {
  await database.deleteReadingGoal(date);
  await syncAfterLocalMutation({ kind: 'reading-goals-deleted' });
}

/**
 * Delete one or more books from the user's library. When upward sync
 * is enabled, the sync engine also deletes them from the connected
 * source; otherwise the deletion is local-only by direction policy.
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
): Promise<void> {
  const local = getLocalEndpoint();
  // Local delete throws on any per-id failure; the surviving deleted
  // ids stay in IDB and `dataListChanged$` already fired, so the UI
  // re-renders from the new book list without needing the partial set
  // threaded through the return.
  await local.deleteBookData(titles, cancelSignal, keepLocalStatistics);

  await syncAfterLocalMutation({ kind: 'books-deleted', titles, cancelSignal });
}
