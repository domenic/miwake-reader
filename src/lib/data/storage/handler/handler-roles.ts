import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import type { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import type { SyncEndpointType, SyncTitle } from '$lib/data/storage/storage-types';

// Re-export so callers can import settings type alongside the
// interfaces it belongs with.
export { ReplicationSaveBehavior };

/**
 * Per-scope settings: things that vary call-by-call rather than
 * across a handler's lifetime. `cacheStorageData`,
 * `askForStorageUnlock`, and the per-handler `storageSourceName` are
 * handler-level instead — they're configured once at factory time.
 */
export interface ScopedSettings {
  saveBehavior: ReplicationSaveBehavior;
  statisticsMergeMode: MergeMode;
  readingGoalsMergeMode: MergeMode;
}

/**
 * Per-book operation surface, bound to a specific (context, settings)
 * pair by `BookOperations.scoped(...)`. Methods take only the data
 * args they need; ctx and settings are captured by the closure. One
 * scope ≈ one book × one save-behavior × one merge-mode.
 *
 * Reading goals are NOT here — they're global, not per-book. See
 * the reading-goals methods on `BookOperations`.
 */
export interface ScopedBookOperations {
  getFilenameForRecentCheck(fileIdentifier: string): Promise<string | undefined>;
  isBookPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;
  isProgressPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;
  areStatisticsPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;

  getBook(): Promise<Omit<BooksDbBookData, 'id'> | undefined>;
  getProgress(): Promise<BooksDbBookmarkData | undefined>;
  getStatistics(): Promise<{
    statistics: BooksDbStatistic[] | undefined;
    lastStatisticModified: number;
  }>;
  getCover(): Promise<Blob | undefined>;

  saveBook(data: Omit<BooksDbBookData, 'id'>, skipTimestampFallback?: boolean): Promise<number>;
  saveProgress(data: BooksDbBookmarkData): Promise<void>;
  saveStatistics(data: BooksDbStatistic[], lastStatisticModified: number): Promise<void>;
  saveCover(data: Blob | undefined): Promise<void>;
}

/**
 * Handler-level operations: cache management, source-wide deletion,
 * the scope factory, and global (non-per-book) operations like
 * reading goals. The replicator codes against this shared surface,
 * but its parameter types stay asymmetric (`library`, `endpoint`) so
 * `replicateData({ library: A, endpoint: B })` with two sync
 * endpoints is rejected at the type level.
 */
export interface BookOperations {
  scoped(
    context: ReplicationContext,
    settings: ScopedSettings,
    signal?: AbortSignal
  ): ScopedBookOperations;

  deleteBookData(
    booksToDelete: string[],
    signal: AbortSignal,
    keepLocalStatistics: boolean
  ): Promise<number[]>;

  /**
   * Reading goals are app-global (no per-book context). The settings
   * argument carries the source's saveBehavior (for the
   * up-to-date short-circuit) and the target's
   * readingGoalsMergeMode (for save-side merge semantics).
   */
  getReadingGoalsFilename(settings: ScopedSettings): Promise<string | undefined>;
  areReadingGoalsPresentAndUpToDate(referenceFilename: string | undefined): Promise<boolean>;
  getReadingGoals(signal?: AbortSignal): Promise<{
    readingGoals: BooksDbReadingGoal[] | undefined;
    lastGoalModified: number;
  }>;
  saveReadingGoals(
    data: BooksDbReadingGoal[],
    lastGoalModified: number,
    settings: ScopedSettings,
    signal?: AbortSignal
  ): Promise<void>;
}

/**
 * The local-side adapter the replicator pulls into and pushes from —
 * a BookOperations peer of GDriveStorageHandler /
 * OneDriveStorageHandler / FilesystemStorageHandler backed by the
 * local IDB. UI code should reach through `$lib/data/library`
 * instead; writes here are sync-naive by design.
 */
export interface LocalReplicationEndpoint extends BookOperations {
  readonly kind: 'local';
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
  listSyncTitles(opts?: { refresh?: boolean; silentOnly?: boolean }): Promise<SyncTitle[]>;
  /**
   * OAuth-flavored endpoints (GDrive, OneDrive) re-establish a token
   * here. FS/backup are no-ops. `silentOnly` skips popup-opening and
   * throws `NeedsInteractiveAuthError` if a fresh token can't be
   * obtained from cache or refresh — used on the boot / ambient paths
   * where there's no user gesture available.
   */
  authenticate(authWindow: Window | null, silentOnly?: boolean): Promise<void>;
}
