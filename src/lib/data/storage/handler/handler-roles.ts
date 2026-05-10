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
 * of a sync. LocalReplicationEndpoint and SyncEndpoint both extend
 * this — the replicator codes against the shared surface, but its
 * parameter types are still the asymmetric (local, endpoint) pair so
 * calls like `replicateData(syncEndpointA, syncEndpointB)` are
 * rejected at the type level (we never replicate between two
 * endpoints).
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
 * The local-side adapter the replicator pulls into and pushes from —
 * a BookOperations peer of GDriveStorageHandler /
 * OneDriveStorageHandler / FilesystemStorageHandler that happens to
 * be backed by the local IDB. Exactly one implementation:
 * LocalReplicationEndpoint.
 *
 * Distinct from `$lib/data/library` (the user-facing module). UI
 * handlers should reach through library, not this interface — writes
 * here are sync-naive by design (a triggerSync at this layer would
 * loop replicator pulls right back to the remote).
 */
export interface LocalReplicationEndpoint extends BookOperations {
  readonly kind: 'local';

  /**
   * The local endpoint always knows the IDB id of a book it holds,
   * so its getBook return is narrower than the BookOperations contract:
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
  /**
   * OAuth-flavored endpoints (GDrive, OneDrive) re-establish a token
   * here. FS/backup are no-ops. `silentOnly` skips popup-opening and
   * throws `NeedsInteractiveAuthError` if a fresh token can't be
   * obtained from cache or refresh — used on the boot / ambient paths
   * where there's no user gesture available.
   */
  authenticate(authWindow: Window | null, silentOnly?: boolean): Promise<void>;
}
