import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type {
  BookOperations,
  LocalReplicationEndpoint,
  ScopedSettings,
  SyncEndpoint
} from '$lib/data/storage/handler/handler-roles';
import { storage } from '$lib/data/window/navigator/storage';
import { StorageDataType } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import { AbortError, throwIfAborted } from '$lib/functions/replication/replication-error';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import pLimit from 'p-limit';

/**
 * Direction of a replication relative to the library:
 *   - `'pull'`: endpoint → library (the library is the target)
 *   - `'push'`: library → endpoint (the library is the source)
 */
export type ReplicationDirection = 'push' | 'pull';

/**
 * `library` and `endpoint` are typed asymmetrically so the type
 * system rejects `replicateData({ library: A, endpoint: B })` where
 * both are sync endpoints — we never replicate between two remotes.
 * Direction picks which side is the source.
 *
 * `sourceSettings` / `targetSettings` are separate because some flows
 * are asymmetric: force-resync's source gets `Overwrite` to break the
 * up-to-date check while the target stays default; backup-import is
 * zip-wins on the source / browser-default on the target. Symmetric
 * callers (ambient push, newest-resync) pass the same object twice.
 *
 * Resolves on success. Throws on any failure (including AbortError on
 * cancel). Per-book partial successes are observable via IDB side
 * effects (dataListChanged$ / bookmarksChanged$); callers that care
 * about which book worked should subscribe to those rather than parse
 * the thrown error.
 */
export interface ReplicateDataOptions {
  library: LocalReplicationEndpoint;
  endpoint: SyncEndpoint;
  direction: ReplicationDirection;
  /** Whether to fire dataListChanged$ after writes; true for flows
   *  that affect /manage's view (force-resync, backup-import). */
  refreshDataList: boolean;
  contexts: ReplicationContext[];
  dataToReplicate: StorageDataType[];
  sourceSettings: ScopedSettings;
  targetSettings: ScopedSettings;
  cancelSignal?: AbortSignal;
}

export async function importBackup(
  source: BackupStorageHandler,
  library: LocalReplicationEndpoint,
  file: File,
  sourceSettings: ScopedSettings,
  targetSettings: ScopedSettings,
  cancelSignal: AbortSignal
) {
  return replicateData({
    library,
    endpoint: source,
    direction: 'pull',
    refreshDataList: true,
    contexts: await source.setBackupZip(file),
    dataToReplicate: [
      StorageDataType.DATA,
      StorageDataType.PROGRESS,
      StorageDataType.STATISTICS,
      StorageDataType.READING_GOALS
    ],
    sourceSettings,
    targetSettings,
    cancelSignal
  });
}

export async function replicateData(opts: ReplicateDataOptions) {
  const {
    library,
    endpoint,
    direction,
    refreshDataList,
    contexts,
    dataToReplicate,
    sourceSettings,
    targetSettings,
    cancelSignal
  } = opts;
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

  const errors: Error[] = [];
  let processed = 0;

  replicationProgress$.next({ maxProgress });

  if (direction === 'pull') {
    // Pulling into the library — request persistent storage so the
    // OS doesn't evict our IDB. Pushes don't need this; the endpoint
    // manages its own persistence.
    await persistLibraryStorage();
  }

  contexts.forEach((context) =>
    replicationTasks.push(
      replicationLimiter(async () => {
        try {
          throwIfAborted(cancelSignal);

          let dataProcessed = false;

          const sourceScoped = source.scoped(context, sourceSettings, cancelSignal);
          const targetScoped = target.scoped(context, targetSettings, cancelSignal);

          if (processBookData) {
            if (
              await targetScoped.isBookPresentAndUpToDate(
                await sourceScoped.getFilenameForRecentCheck('bookdata_')
              )
            ) {
              checkCancelAndProgress(cancelSignal, true, true);
              checkCancelAndProgress(cancelSignal, true, true);
            } else {
              const bookData = await sourceScoped.getBook();
              checkCancelAndProgress(cancelSignal);
              if (bookData) {
                await targetScoped.saveBook(bookData);
                dataProcessed = true;
              }
              checkCancelAndProgress(cancelSignal, bookOperationsLength === 1, !bookData);
            }
          }

          if (processProgressData) {
            if (
              await targetScoped.isProgressPresentAndUpToDate(
                await sourceScoped.getFilenameForRecentCheck('progress_')
              )
            ) {
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
            } else {
              const progressData = await sourceScoped.getProgress();
              checkCancelAndProgress(cancelSignal, !dataProcessed);
              if (progressData) {
                await targetScoped.saveProgress(progressData);
                dataProcessed = true;
              }
              checkCancelAndProgress(cancelSignal, !dataProcessed, !progressData);
            }
          }

          if (processStatistics) {
            if (
              await targetScoped.areStatisticsPresentAndUpToDate(
                await sourceScoped.getFilenameForRecentCheck('statistics_')
              )
            ) {
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
              checkCancelAndProgress(cancelSignal, !dataProcessed, true);
            } else {
              const { statistics, lastStatisticModified } = await sourceScoped.getStatistics();
              checkCancelAndProgress(cancelSignal, !dataProcessed);
              if (statistics) {
                await targetScoped.saveStatistics(statistics, lastStatisticModified);
                dataProcessed = true;
              }
              checkCancelAndProgress(cancelSignal, !dataProcessed, !statistics);
            }
          }

          if (dataProcessed) {
            const coverData = await sourceScoped.getCover();
            checkCancelAndProgress(cancelSignal, !coverData);
            await targetScoped.saveCover(coverData);
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
          // handleErrorDuringReplication re-throws AbortError and
          // logs other errors as a side effect. Collect non-abort
          // errors (with a per-context prefix so the sync-health
          // banner can name the offending book) to throw at the end
          // as an AggregateError.
          handleErrorDuringReplication(
            error,
            `Error Processing ${context.title}: `,
            [replicationLimiter],
            progressBaseForBookOperations
          );
          errors.push(new Error(`Error Processing ${context.title}: ${error.message}`));
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
              await source.getReadingGoalsFilename(sourceSettings)
            )
          ) {
            checkCancelAndProgress(cancelSignal, true, true);
            checkCancelAndProgress(cancelSignal, true, true);
          } else {
            const { readingGoals, lastGoalModified } = await source.getReadingGoals(cancelSignal);
            checkCancelAndProgress(cancelSignal);
            if (readingGoals) {
              await target.saveReadingGoals(
                readingGoals,
                lastGoalModified,
                targetSettings,
                cancelSignal
              );
            }
            checkCancelAndProgress(cancelSignal, false, !readingGoals);
          }
          processed += 1;
        } catch (error: any) {
          handleErrorDuringReplication(
            error,
            `Error Processing Reading Goals: `,
            [replicationLimiter],
            progressBaseForOtherOperations
          );
          errors.push(new Error(`Error Processing Reading Goals: ${error.message}`));
        }
      })
    );
  }

  // AbortError gets re-thrown from inside the per-task try (via
  // handleErrorDuringReplication) and lands here as the rejection.
  // Re-throw so a cancel isn't disguised as a successful resolution.
  await Promise.all(replicationTasks).catch((err) => {
    if (err instanceof AbortError) throw err;
  });

  if (target instanceof BackupStorageHandler) {
    await target.createExportZip(document, cancelSignal?.aborted || !processed).catch((err) => {
      errors.push(err);
    });
  }

  if (errors.length) {
    throw new AggregateError(errors, errors[0].message);
  }
}

export async function persistLibraryStorage() {
  // Best-effort. Browsers either grant on this call (and remember it
  // forever) or deny silently per their own engagement heuristics —
  // either way there's nothing useful for us to do beyond ask.
  await storage.persist().catch(() => {});
}

export function checkCancelAndProgress(
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
