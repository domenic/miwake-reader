import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import { database, lastReadingGoalsModified$ } from '$lib/data/store';
import { StorageDataType } from '$lib/data/storage/storage-types';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { BaseScopedHandler, BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type {
  LocalReplicationEndpoint as LocalReplicationEndpointRole,
  ScopedBookOperations,
  ScopedSettings
} from '$lib/data/storage/handler/handler-roles';

/**
 * Local-IDB-backed implementation of the BookOperations contract,
 * used as the local side of the replicator's (local, endpoint) pair.
 *
 * NOT user-facing: components writing on a user's behalf should go
 * through `$lib/data/library` instead, which pairs each edit with the
 * appropriate `triggerSync` call. Writes here are sync-naive by
 * design — a trigger at this layer would loop just-pulled data back
 * to the remote.
 */
export class LocalReplicationEndpoint implements LocalReplicationEndpointRole {
  readonly kind = 'local' as const;

  private cacheStorageData = false;

  updateSettings(cacheStorageData: boolean) {
    this.cacheStorageData = cacheStorageData;
  }

  isCacheDisabled() {
    return !this.cacheStorageData;
  }

  clearData() {
    // The local endpoint's only state is IndexedDB itself; there's no
    // in-memory cache to invalidate. Sync endpoints use this hook to
    // drop fetched-listing caches.
  }

  scoped(
    context: ReplicationContext,
    settings: ScopedSettings,
    cancelSignal?: AbortSignal
  ): ScopedBookOperations {
    return new ScopedLocalReplicationEndpoint(this, context, settings, cancelSignal);
  }

  async deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics: boolean
  ): Promise<number[]> {
    const ids: number[] = [];
    const idToTitle = new Map<number, string>();

    for (const title of booksToDelete) {
      const book = await database.getDataByTitle(title);
      if (book) {
        ids.push(book.id);
        idToTitle.set(book.id, title);
      }
    }

    try {
      return await database.deleteData(ids, idToTitle, cancelSignal, keepLocalStatistics);
    } finally {
      // On partial failure the AggregateError loses the per-id
      // deleted list, but IDB still reflects whatever got through.
      // Fire dataListChanged$ unconditionally so the UI re-renders
      // off the actual book set rather than a stale snapshot. The
      // redundant fire on 0-id success is one cheap no-op rerender.
      database.dataListChanged$.next();
    }
  }

  async getReadingGoalsFilename(settings: ScopedSettings) {
    if (settings.saveBehavior === ReplicationSaveBehavior.Overwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }
    const lastGoalModified = lastReadingGoalsModified$.getValue();
    const fileName = lastGoalModified
      ? BaseStorageHandler.getReadingGoalsFileName(lastGoalModified)
      : undefined;
    BaseStorageHandler.reportProgress(0.5);
    BaseStorageHandler.completeStep();
    return fileName;
  }

  areReadingGoalsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return Promise.resolve(false);
    }
    const existingLastModified = lastReadingGoalsModified$.getValue();
    const fileName = existingLastModified
      ? BaseStorageHandler.getReadingGoalsFileName(existingLastModified)
      : undefined;
    BaseStorageHandler.reportProgress();
    return Promise.resolve(
      BaseStorageHandler.checkIsPresentAndUpToDate(
        BaseStorageHandler.getReadingGoalsMetadata,
        'lastGoalModified',
        referenceFilename,
        fileName
      )
    );
  }

  async getReadingGoals() {
    const readingGoals = await database.getReadingGoals();
    const lastGoalModified = lastReadingGoalsModified$.getValue();
    BaseStorageHandler.reportProgress();
    if (!lastGoalModified) {
      return { readingGoals: undefined, lastGoalModified: 0 };
    }
    return { readingGoals, lastGoalModified };
  }

  async saveReadingGoals(
    data: BooksDbReadingGoal[],
    lastGoalModified: number,
    settings: ScopedSettings
  ) {
    await database.storeReadingGoals(
      data,
      settings.saveBehavior,
      settings.readingGoalsMergeMode,
      lastGoalModified
    );
    BaseStorageHandler.reportProgress();
  }
}

class ScopedLocalReplicationEndpoint
  extends BaseScopedHandler<LocalReplicationEndpoint>
  implements ScopedBookOperations
{
  async getFilenameForRecentCheck(fileIdentifier: string) {
    if (this.isOverwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    let fileName: string | undefined;

    if (fileIdentifier === 'bookdata_') {
      const book = await database.getDataByTitle(this.title);
      fileName = book ? BaseStorageHandler.getBookFileName(book) : undefined;
    } else if (fileIdentifier === 'progress_') {
      const progress = await this.getProgress();
      fileName = progress ? BaseStorageHandler.getProgressFileName(progress) : undefined;
    } else if (fileIdentifier === 'statistics_') {
      const lastStatisticModified = await database.getLastModifiedForType(
        this.title,
        StorageDataType.STATISTICS
      );
      fileName = lastStatisticModified
        ? BaseStorageHandler.getStatisticsFileName([], lastStatisticModified)
        : undefined;
    }

    BaseStorageHandler.reportProgress(0.5);
    BaseStorageHandler.completeStep();
    return fileName;
  }

  async isBookPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const book = await database.getDataByTitle(this.title);
    BaseStorageHandler.reportProgress(0.5);

    let isPresentAndUpToDate = false;

    // A placeholder row (no elementHtml) is metadata only — never
    // "present and up to date," even if its timestamp matches the
    // remote. Skipping this would let the replicator short-circuit
    // the one download that would actually hydrate the book.
    if (book && book.elementHtml) {
      const { lastBookModified, lastBookOpen } =
        BaseStorageHandler.getBookMetadata(referenceFilename);
      const { lastBookModified: existingBookModified, lastBookOpen: existingBookOpen } = book;

      isPresentAndUpToDate = !!(
        existingBookModified &&
        lastBookModified &&
        existingBookModified >= lastBookModified &&
        (existingBookOpen || 0) >= (lastBookOpen || 0)
      );
    }

    BaseStorageHandler.reportProgress(0.5);
    return isPresentAndUpToDate;
  }

  async isProgressPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const progress = await this.getProgress();
    const fileName = progress ? BaseStorageHandler.getProgressFileName(progress) : undefined;

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getProgressMetadata,
      'lastBookmarkModified',
      referenceFilename,
      fileName
    );
  }

  async areStatisticsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const existingLastModified = await database.getLastModifiedForType(
      this.title,
      StorageDataType.STATISTICS
    );
    const fileName = existingLastModified
      ? BaseStorageHandler.getStatisticsFileName([], existingLastModified)
      : undefined;

    BaseStorageHandler.reportProgress();

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getStatisticsMetadata,
      'lastStatisticModified',
      referenceFilename,
      fileName
    );
  }

  async getBook(): Promise<BooksDbBookData | undefined> {
    const book = this.context.id
      ? await database.getData(this.context.id)
      : await database.getDataByTitle(this.title);

    BaseStorageHandler.reportProgress();
    return book;
  }

  async getProgress() {
    const dataId = this.context.id || (await database.getDataByTitle(this.title))?.id;
    BaseStorageHandler.reportProgress(0.5);
    if (!dataId) return undefined;

    const bookmark = await database.getBookmark(dataId);
    // Placeholder bookmarks carry source-side progress for /manage to display,
    // but lack the actual reading position. Treat them as "no progress" for
    // sync purposes so isProgressPresentAndUpToDate returns false (forcing a
    // pull on book-open) and we never push a placeholder back to the source.
    return bookmark?.placeholder ? undefined : bookmark;
  }

  async getStatistics() {
    const statistics = await database.getStatisticsForBook(this.title);
    BaseStorageHandler.reportProgress(0.5);

    const lastStatisticModified = await database.getLastModifiedForType(
      this.title,
      StorageDataType.STATISTICS
    );

    if (!lastStatisticModified) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }
    return { statistics, lastStatisticModified };
  }

  async getCover() {
    const cover = this.context.imagePath instanceof Blob ? this.context.imagePath : undefined;
    BaseStorageHandler.reportProgress();
    return cover;
  }

  async saveBook(data: Omit<BooksDbBookData, 'id'>, skipTimestampFallback = true) {
    const stored = await database.upsertData(data, this.saveBehavior, skipTimestampFallback);
    BaseStorageHandler.reportProgress();
    return stored.id;
  }

  async saveProgress(data: BooksDbBookmarkData) {
    const dataId = this.context.id || (await database.getDataByTitle(this.title))?.id;
    BaseStorageHandler.reportProgress(0.5);
    if (dataId) {
      data.dataId = dataId;
      await database.putBookmark(data);
    }
  }

  async saveStatistics(data: BooksDbStatistic[], lastStatisticModified: number) {
    await database.storeStatistics(
      this.title,
      data,
      this.saveBehavior,
      this.settings.statisticsMergeMode,
      lastStatisticModified
    );
    BaseStorageHandler.reportProgress();
  }

  saveCover(_data: Blob | undefined): Promise<void> {
    // Covers live inside BookData; no separate write needed.
    BaseStorageHandler.reportProgress();
    return Promise.resolve();
  }
}
