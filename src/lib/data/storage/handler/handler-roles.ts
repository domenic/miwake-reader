import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import type {
  ReplicationContext,
  ReplicationDeleteResult
} from '$lib/functions/replication/replication-progress';
import type { SyncEndpointType, SyncTitle } from '$lib/data/storage/storage-types';

/**
 * The shared per-book operations the replicator drives on both sides
 * of a sync. Library and SyncEndpoint both extend this — the replicator
 * codes against the shared surface, but its parameter types are still
 * the asymmetric Library / SyncEndpoint pair so calls like
 * `replicateData(syncEndpointA, syncEndpointB)` are rejected at the
 * type level (we never replicate between two endpoints).
 */
export interface BookOperations {
  isCacheDisabled(): boolean;
  clearData(clearAll?: boolean): void;
  startContext(context: ReplicationContext, cancelSignal?: AbortSignal): void;

  getFilenameForRecentCheck(fileIdentifier: string): Promise<string | undefined>;
  isBookPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;
  isProgressPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;
  areStatisticsPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;
  areReadingGoalsPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;

  getBook(): Promise<Omit<BooksDbBookData, 'id'> | undefined>;
  getProgress(): Promise<BooksDbBookmarkData | undefined>;
  getStatistics(): Promise<{
    statistics: BooksDbStatistic[] | undefined;
    lastStatisticModified: number;
  }>;
  getCover(): Promise<Blob | undefined>;
  getReadingGoals(): Promise<{
    readingGoals: BooksDbReadingGoal[] | undefined;
    lastGoalModified: number;
  }>;

  saveBook(data: Omit<BooksDbBookData, 'id'>, skipTimestampFallback?: boolean): Promise<number>;
  saveProgress(data: BooksDbBookmarkData): Promise<void>;
  saveStatistics(data: BooksDbStatistic[], lastStatisticModified: number): Promise<void>;
  saveCover(data: Blob | undefined): Promise<void>;
  saveReadingGoals(data: BooksDbReadingGoal[], lastGoalModified: number): Promise<void>;

  deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics: boolean
  ): Promise<ReplicationDeleteResult>;
}

/**
 * The local canonical book store backed by IndexedDB. Replicator
 * pulls into this and pushes from this; never an "endpoint." Exactly
 * one implementation: the Library class.
 */
export interface Library extends BookOperations {
  readonly kind: 'library';

  /**
   * The library always knows the IDB id of a book it holds, so its
   * getBook return is narrower than the BookOperations contract:
   * callers like the reader can rely on `id` being present.
   */
  getBook(): Promise<BooksDbBookData | undefined>;
  updateLastRead(book: BooksDbBookData): Promise<void>;
}

/**
 * An external location books are mirrored to/from. Implementations:
 * GDriveStorageHandler, OneDriveStorageHandler,
 * FilesystemStorageHandler, BackupStorageHandler.
 */
export interface SyncEndpoint extends BookOperations {
  readonly kind: 'sync-endpoint';
  readonly storageType: SyncEndpointType;
  /**
   * List the titles the source advertises. Pass `{ refresh: true }` to
   * bust the handler's cached listing first — necessary when the
   * remote may have changed since this handler-singleton was last
   * used (folder swap, force-resync, post-disconnect reconnect).
   */
  listSyncTitles(opts?: { refresh?: boolean }): Promise<SyncTitle[]>;
}
