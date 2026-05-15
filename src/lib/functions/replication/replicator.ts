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
 * `settings` is one bag covering every "should the target keep its
 * existing row?" decision: saveBehavior (replicator-level up-to-date
 * short-circuit + target's NewOnly timestamp check) and the merge
 * modes for statistics / reading-goals (merge vs replace). Source
 * and target use the same settings so an override on one side can't
 * silently bypass the other; callers express *intent* via
 * `scopedSettings({ winnerTakesAll })` rather than wiring knobs.
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
  settings: ScopedSettings;
  signal?: AbortSignal;
}

export async function replicateData(opts: ReplicateDataOptions) {
  const {
    library,
    endpoint,
    direction,
    refreshDataList,
    contexts,
    dataToReplicate,
    settings,
    signal
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
          signal?.throwIfAborted();

          let dataProcessed = false;

          const sourceScoped = source.scoped(context, settings, signal);
          const targetScoped = target.scoped(context, settings, signal);

          if (processBookData) {
            if (
              await targetScoped.isBookPresentAndUpToDate(
                await sourceScoped.getFilenameForRecentCheck('bookdata_')
              )
            ) {
              checkCancelAndProgress(signal, true, true);
              checkCancelAndProgress(signal, true, true);
            } else {
              const bookData = await sourceScoped.getBook();
              checkCancelAndProgress(signal);
              if (bookData) {
                await targetScoped.saveBook(bookData);
                dataProcessed = true;
              }
              checkCancelAndProgress(signal, bookOperationsLength === 1, !bookData);
            }
          }

          if (processProgressData) {
            if (
              await targetScoped.isProgressPresentAndUpToDate(
                await sourceScoped.getFilenameForRecentCheck('progress_')
              )
            ) {
              checkCancelAndProgress(signal, !dataProcessed, true);
              checkCancelAndProgress(signal, !dataProcessed, true);
            } else {
              const progressData = await sourceScoped.getProgress();
              checkCancelAndProgress(signal, !dataProcessed);
              if (progressData) {
                await targetScoped.saveProgress(progressData);
                dataProcessed = true;
              }
              checkCancelAndProgress(signal, !dataProcessed, !progressData);
            }
          }

          if (processStatistics) {
            if (
              await targetScoped.areStatisticsPresentAndUpToDate(
                await sourceScoped.getFilenameForRecentCheck('statistics_')
              )
            ) {
              checkCancelAndProgress(signal, !dataProcessed, true);
              checkCancelAndProgress(signal, !dataProcessed, true);
            } else {
              const { statistics, lastStatisticModified } = await sourceScoped.getStatistics();
              checkCancelAndProgress(signal, !dataProcessed);
              if (statistics) {
                await targetScoped.saveStatistics(statistics, lastStatisticModified);
                dataProcessed = true;
              }
              checkCancelAndProgress(signal, !dataProcessed, !statistics);
            }
          }

          if (dataProcessed) {
            const coverData = await sourceScoped.getCover();
            checkCancelAndProgress(signal, !coverData);
            await targetScoped.saveCover(coverData);
            checkCancelAndProgress(signal);

            if (direction === 'pull') {
              if (refreshDataList) {
                database.dataListChanged$.next();
              }
              if (processProgressData) {
                database.bookmarksChanged$.next();
              }
            }
          } else {
            checkCancelAndProgress(signal, true, true);
            checkCancelAndProgress(signal, true, true);
          }

          processed += 1;
        } catch (error: any) {
          // handleErrorDuringReplication re-throws AbortError DOMExceptions and
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
              await source.getReadingGoalsFilename(settings)
            )
          ) {
            checkCancelAndProgress(signal, true, true);
            checkCancelAndProgress(signal, true, true);
          } else {
            const { readingGoals, lastGoalModified } = await source.getReadingGoals(signal);
            checkCancelAndProgress(signal);
            if (readingGoals) {
              await target.saveReadingGoals(readingGoals, lastGoalModified, settings, signal);
            }
            checkCancelAndProgress(signal, false, !readingGoals);
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

  // AbortError DOMExceptions get re-thrown from inside the per-task try (via
  // handleErrorDuringReplication) and lands here as the rejection.
  // Re-throw so a cancel isn't disguised as a successful resolution.
  await Promise.all(replicationTasks).catch((err) => {
    if (err.name === 'AbortError') throw err;
  });

  if (target instanceof BackupStorageHandler) {
    await target.createExportZip(document, signal?.aborted || !processed).catch((err) => {
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
  signal: AbortSignal | undefined,
  allowCancel = true,
  addDefaultProgress = false
) {
  if (allowCancel) {
    signal?.throwIfAborted();
  }

  if (addDefaultProgress) {
    BaseStorageHandler.reportProgress();
  }

  BaseStorageHandler.completeStep();
}
