import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import { database, lastReadingGoalsModified$ } from '$lib/data/store';
import type { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { StorageDataType } from '$lib/data/storage/storage-types';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type {
  LocalReplicationEndpoint as LocalReplicationEndpointRole,
  LocalScopedBookOperations,
  ScopedSettings
} from '$lib/data/storage/handler/handler-roles';

/**
 * The local-IDB-backed implementation of the BookOperations contract,
 * used as the local-side adapter by the replicator.
 *
 * NOT user-facing: components writing on a user's behalf should go
 * through `$lib/data/library` instead, which pairs each edit with the
 * appropriate `triggerSync` call. This class deliberately performs no
 * sync triggering — replicator pulls already write through it, and a
 * trigger here would loop the just-pulled data back to the remote.
 *
 * Replicator is parameterized as `(local: LocalReplicationEndpoint,
 * endpoint: SyncEndpoint, direction: 'push' | 'pull', ...)` so the
 * asymmetry is encoded in the type and "is the target BROWSER?"
 * branches in shared code disappear — the call site already knows
 * which side is local.
 *
 * Static helpers (file-name parsers, progress reporting) are reused
 * from BaseStorageHandler since they're storage-agnostic; the
 * endpoint itself doesn't extend the sync-endpoint chassis.
 */
export class LocalReplicationEndpoint implements LocalReplicationEndpointRole {
  readonly kind = 'local' as const;

  private currentContext: ReplicationContext = { id: 0, title: '', imagePath: '' };

  private cancelSignal: AbortSignal | undefined;

  private saveBehavior = ReplicationSaveBehavior.NewOnly;

  private statisticsMergeMode: MergeMode | undefined;

  private readingGoalsMergeMode: MergeMode | undefined;

  private cacheStorageData = false;

  updateSettings(
    saveBehavior: ReplicationSaveBehavior,
    statisticsMergeMode: MergeMode,
    readingGoalsMergeMode: MergeMode,
    cacheStorageData: boolean
  ) {
    this.saveBehavior = saveBehavior;
    this.statisticsMergeMode = statisticsMergeMode;
    this.readingGoalsMergeMode = readingGoalsMergeMode;
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
  ): LocalScopedBookOperations {
    this.currentContext = context;
    this.cancelSignal = cancelSignal;
    this.saveBehavior = settings.saveBehavior;
    this.statisticsMergeMode = settings.statisticsMergeMode;
    this.readingGoalsMergeMode = settings.readingGoalsMergeMode;
    return {
      getFilenameForRecentCheck: (prefix) => this.getFilenameForRecentCheck(prefix),
      isBookPresentAndUpToDate: (filename) => this.isBookPresentAndUpToDate(filename),
      isProgressPresentAndUpToDate: (filename) => this.isProgressPresentAndUpToDate(filename),
      areStatisticsPresentAndUpToDate: (filename) => this.areStatisticsPresentAndUpToDate(filename),
      areReadingGoalsPresentAndUpToDate: (filename) =>
        this.areReadingGoalsPresentAndUpToDate(filename),
      getBook: () => this.getBook(),
      getProgress: () => this.getProgress(),
      getStatistics: () => this.getStatistics(),
      getCover: () => this.getCover(),
      getReadingGoals: () => this.getReadingGoals(),
      saveBook: (data, skipTimestampFallback) => this.saveBook(data, skipTimestampFallback),
      saveProgress: (data) => this.saveProgress(data),
      saveStatistics: (data, lastStatisticModified) =>
        this.saveStatistics(data, lastStatisticModified),
      saveCover: (data) => this.saveCover(data),
      saveReadingGoals: (data, lastGoalModified) => this.saveReadingGoals(data, lastGoalModified),
      updateLastRead: (book) => this.updateLastRead(book)
    };
  }

  async getFilenameForRecentCheck(fileIdentifier: string) {
    if (this.saveBehavior === ReplicationSaveBehavior.Overwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    let fileName: string | undefined;

    if (fileIdentifier === 'bookdata_') {
      const book = await database.getDataByTitle(this.currentContext.title);
      fileName = book ? BaseStorageHandler.getBookFileName(book) : undefined;
    } else if (fileIdentifier === 'progress_') {
      const progress = await this.getProgress();
      fileName = progress ? BaseStorageHandler.getProgressFileName(progress) : undefined;
    } else if (fileIdentifier === 'statistics_') {
      const lastStatisticModified = await database.getLastModifiedForType(
        this.currentContext.title,
        StorageDataType.STATISTICS
      );
      fileName = lastStatisticModified
        ? BaseStorageHandler.getStatisticsFileName([], lastStatisticModified)
        : undefined;
    } else if (fileIdentifier === BaseStorageHandler.readingGoalsFilePrefix) {
      const lastGoalModified = lastReadingGoalsModified$.getValue();
      fileName = lastGoalModified
        ? BaseStorageHandler.getReadingGoalsFileName(lastGoalModified)
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

    const book = await database.getDataByTitle(this.currentContext.title);
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
      this.currentContext.title,
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

  async getBook(): Promise<BooksDbBookData | undefined> {
    const book = this.currentContext.id
      ? await database.getData(this.currentContext.id)
      : await database.getDataByTitle(this.currentContext.title);

    BaseStorageHandler.reportProgress();
    return book;
  }

  async getProgress() {
    const dataId =
      this.currentContext.id || (await database.getDataByTitle(this.currentContext.title))?.id;
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
    const statistics = await database.getStatisticsForBook(this.currentContext.title);
    BaseStorageHandler.reportProgress(0.5);

    const lastStatisticModified = await database.getLastModifiedForType(
      this.currentContext.title,
      StorageDataType.STATISTICS
    );

    if (!lastStatisticModified) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }
    return { statistics, lastStatisticModified };
  }

  async getCover() {
    const cover =
      this.currentContext.imagePath instanceof Blob ? this.currentContext.imagePath : undefined;
    BaseStorageHandler.reportProgress();
    return cover;
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

  async saveBook(data: Omit<BooksDbBookData, 'id'>, skipTimestampFallback = true) {
    const stored = await database.upsertData(data, this.saveBehavior, skipTimestampFallback);
    BaseStorageHandler.reportProgress();
    return stored.id;
  }

  async saveProgress(data: BooksDbBookmarkData) {
    const dataId =
      this.currentContext.id || (await database.getDataByTitle(this.currentContext.title))?.id;
    BaseStorageHandler.reportProgress(0.5);
    if (dataId) {
      data.dataId = dataId;
      await database.putBookmark(data);
    }
  }

  async saveStatistics(data: BooksDbStatistic[], lastStatisticModified: number) {
    if (!this.statisticsMergeMode) {
      throw new Error('LocalReplicationEndpoint.saveStatistics called before updateSettings');
    }
    await database.storeStatistics(
      this.currentContext.title,
      data,
      this.saveBehavior,
      this.statisticsMergeMode,
      lastStatisticModified
    );
    BaseStorageHandler.reportProgress();
  }

  saveCover(_data: Blob | undefined): Promise<void> {
    // Covers live inside BookData; no separate write needed.
    BaseStorageHandler.reportProgress();
    return Promise.resolve();
  }

  async saveReadingGoals(data: BooksDbReadingGoal[], lastGoalModified: number) {
    if (!this.readingGoalsMergeMode) {
      throw new Error('LocalReplicationEndpoint.saveReadingGoals called before updateSettings');
    }
    await database.storeReadingGoals(
      data,
      this.saveBehavior,
      this.readingGoalsMergeMode,
      lastGoalModified
    );
    BaseStorageHandler.reportProgress();
  }

  async updateLastRead(book: BooksDbBookData) {
    const db = await database.db;
    await db.put('data', book);
  }

  async deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics: boolean
  ) {
    const ids: number[] = [];
    const idToTitle = new Map<number, string>();

    for (const title of booksToDelete) {
      const book = await database.getDataByTitle(title);
      if (book) {
        ids.push(book.id);
        idToTitle.set(book.id, title);
      }
    }

    const { error, deleted } = await database
      .deleteData(ids, idToTitle, cancelSignal, keepLocalStatistics)
      .catch((catchedError) => ({ error: catchedError.message, deleted: [] }));

    if (deleted.length) {
      database.dataListChanged$.next();
    }

    return { error, deleted };
  }
}
