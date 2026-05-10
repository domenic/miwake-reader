import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type {
  BookOperations,
  Library,
  SyncEndpoint
} from '$lib/data/storage/handler/handler-roles';
import { storage } from '$lib/data/window/navigator/storage';
import { StorageDataType } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import loadEpub from '$lib/functions/file-loaders/epub/load-epub';
import loadHtmlz from '$lib/functions/file-loaders/htmlz/load-htmlz';
import loadTxt from '$lib/functions/file-loaders/txt/load-txt';
import type { LoadData } from '$lib/functions/file-loaders/types';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import { throwIfAborted } from '$lib/functions/replication/replication-error';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import { triggerSync } from '$lib/data/sync/sync-engine';
import pLimit from 'p-limit';

/**
 * Direction of a replication relative to the library:
 *   - `'pull'`: endpoint → library (the library is the target)
 *   - `'push'`: library → endpoint (the library is the source)
 */
export type ReplicationDirection = 'push' | 'pull';

export async function importData(
  document: Document,
  library: Library,
  files: File[],
  cancelSignal: AbortSignal,
  fileCountData?: Record<string, number>
) {
  const dataIds: number[] = [];
  const tasks: Promise<void>[] = [];
  const lastBookModified = new Date().getTime();
  const progressBase = 3; // load -> save -> cover;
  const maxProgress = progressBase * files.length;
  const limiter = pLimit(1);

  let errorMessage = '';

  replicationProgress$.next({ progressBase, maxProgress });
  await persistLibraryStorage();

  if (library.isCacheDisabled()) {
    library.clearData(false);
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

          library.startContext(
            { title: bookContent.title, imagePath: bookContent.coverImage || '' },
            cancelSignal
          );

          const dataId = await library.saveBook(bookContent, false);
          dataIds.push(dataId);

          checkCancelAndProgress(cancelSignal, false);

          if (bookContent.coverImage) {
            await library.saveCover(bookContent.coverImage);
          }

          // Newly-imported books need to propagate to whatever sync
          // location is connected — saveBook only writes the local
          // library, and the ambient push is gated on triggerSync().
          // Cover ships bundled with the DATA push.
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

export async function importBackup(
  source: BackupStorageHandler,
  library: Library,
  file: File,
  cancelSignal: AbortSignal
) {
  return replicateData(
    library,
    source,
    'pull',
    true,
    await source.setBackupZip(file),
    [
      StorageDataType.DATA,
      StorageDataType.PROGRESS,
      StorageDataType.STATISTICS,
      StorageDataType.READING_GOALS
    ],
    cancelSignal
  );
}

/**
 * Move books between the library and a sync endpoint. The asymmetric
 * shape — `(library, endpoint, direction)` rather than `(from, to)` —
 * encodes the invariant that we never replicate between two endpoints
 * directly. The library always drives /manage's view, so post-write
 * notifications fire only on `'pull'`.
 */
export async function replicateData(
  library: Library,
  endpoint: SyncEndpoint,
  direction: ReplicationDirection,
  refreshDataList: boolean,
  contexts: ReplicationContext[],
  dataToReplicate: StorageDataType[],
  cancelSignal?: AbortSignal
) {
  const source: BookOperations = direction === 'push' ? library : endpoint;
  const target: BookOperations = direction === 'push' ? endpoint : library;

  const bookOperationsLength = dataToReplicate.filter(
    (entry) => entry !== StorageDataType.READING_GOALS
  ).length;
  const otherOperationsLength = dataToReplicate.length - bookOperationsLength;
  // recent check -> source retrieval -> target storage per data type + retrieve and store cover
  const progressBaseForBookOperations = bookOperationsLength ? bookOperationsLength * 4 + 2 : 0;
  const progressBaseForOtherOperations = otherOperationsLength * 4;
  const maxProgress =
    progressBaseForBookOperations * contexts.length + progressBaseForOtherOperations;
  const processBookData = dataToReplicate.includes(StorageDataType.DATA);
  const processProgressData = dataToReplicate.includes(StorageDataType.PROGRESS);
  const processStatistics = dataToReplicate.includes(StorageDataType.STATISTICS);
  const processReadingGoals = dataToReplicate.includes(StorageDataType.READING_GOALS);
  const replicationLimiter = pLimit(1);
  const replicationTasks: Promise<void>[] = [];

  let errorMessage = '';
  let processed = 0;

  replicationProgress$.next({ maxProgress });

  if (direction === 'pull') {
    // Pulling into the library — request persistent storage so the
    // OS doesn't evict our IDB. Pushes don't need this; the endpoint
    // manages its own persistence.
    await persistLibraryStorage();
  }

  [source, target].forEach((handler) => {
    if (handler.isCacheDisabled()) {
      handler.clearData(false);
    }
  });

  contexts.forEach((context) =>
    replicationTasks.push(
      replicationLimiter(async () => {
        try {
          throwIfAborted(cancelSignal);

          let dataProcessed = false;

          source.startContext(context, cancelSignal);
          target.startContext(context, cancelSignal);

          if (processBookData) {
            if (
              await target.isBookPresentAndUpToDate(
                await source.getFilenameForRecentCheck('bookdata_')
              )
            ) {
              checkCancelAndProgress(cancelSignal, true, true);
              checkCancelAndProgress(cancelSignal, true, true);
            } else {
              const bookData = await source.getBook();
              checkCancelAndProgress(cancelSignal);
              if (bookData) {
                await target.saveBook(bookData);
                dataProcessed = true;
              }
              checkCancelAndProgress(cancelSignal, bookOperationsLength === 1, !bookData);
            }
          }

          if (processProgressData) {
            if (
              await target.isProgressPresentAndUpToDate(
                await source.getFilenameForRecentCheck('progress_')
              )
            ) {
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
            } else {
              const progressData = await source.getProgress();
              checkCancelAndProgress(cancelSignal, !dataProcessed);
              if (progressData) {
                await target.saveProgress(progressData);
                dataProcessed = true;
              }
              checkCancelAndProgress(cancelSignal, !dataProcessed, !progressData);
            }
          }

          if (processStatistics) {
            if (
              await target.areStatisticsPresentAndUpToDate(
                await source.getFilenameForRecentCheck('statistics_')
              )
            ) {
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
            } else {
              const { statistics, lastStatisticModified } = await source.getStatistics();
              checkCancelAndProgress(cancelSignal, !dataProcessed);
              if (statistics) {
                await target.saveStatistics(statistics, lastStatisticModified);
                dataProcessed = true;
              }
              checkCancelAndProgress(cancelSignal, !dataProcessed, !statistics);
            }
          }

          if (dataProcessed) {
            const coverData = await source.getCover();
            checkCancelAndProgress(cancelSignal, !coverData);
            await target.saveCover(coverData);
            checkCancelAndProgress(cancelSignal);

            if (direction === 'pull') {
              if (refreshDataList) {
                database.dataListChanged$.next();
              }
              if (processProgressData) {
                database.bookmarksChanged$.next();
              }
            }
          } else {
            checkCancelAndProgress(cancelSignal, true, true);
            checkCancelAndProgress(cancelSignal, true, true);
          }

          processed += 1;
        } catch (error: any) {
          errorMessage = handleErrorDuringReplication(
            error,
            `Error Processing ${context.title}: `,
            [replicationLimiter],
            progressBaseForBookOperations
          );
        }
      })
    )
  );

  if (processReadingGoals) {
    replicationTasks.push(
      replicationLimiter(async () => {
        try {
          if (
            await target.areReadingGoalsPresentAndUpToDate(
              await source.getFilenameForRecentCheck(BaseStorageHandler.readingGoalsFilePrefix)
            )
          ) {
            checkCancelAndProgress(cancelSignal, true, true);
            checkCancelAndProgress(cancelSignal, true, true);
          } else {
            const { readingGoals, lastGoalModified } = await source.getReadingGoals();
            checkCancelAndProgress(cancelSignal);
            if (readingGoals) {
              await target.saveReadingGoals(readingGoals, lastGoalModified);
            }
            checkCancelAndProgress(cancelSignal, false, !readingGoals);
          }
          processed += 1;
        } catch (error) {
          errorMessage = handleErrorDuringReplication(
            error,
            `Error Processing Reading Goals: `,
            [replicationLimiter],
            progressBaseForOtherOperations
          );
        }
      })
    );
  }

  await Promise.all(replicationTasks).catch(() => {});

  if (target instanceof BackupStorageHandler) {
    await target.createExportZip(document, cancelSignal?.aborted || !processed).catch((error) => {
      errorMessage = error.message;
    });
  }

  return errorMessage;
}

async function persistLibraryStorage() {
  // Best-effort. Browsers either grant on this call (and remember it
  // forever) or deny silently per their own engagement heuristics —
  // either way there's nothing useful for us to do beyond ask.
  await storage.persist().catch(() => {});
}

function checkCancelAndProgress(
  cancelSignal: AbortSignal | undefined,
  allowCancel = true,
  addDefaultProgress = false
) {
  if (allowCancel) {
    throwIfAborted(cancelSignal);
  }

  if (addDefaultProgress) {
    BaseStorageHandler.reportProgress();
  }

  BaseStorageHandler.completeStep();
}
