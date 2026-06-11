import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic,
  BooksDbStorageSource
} from '$lib/data/database/books-db/versions/books-db';
import { browser } from '$app/environment';
import { StorageDataType } from '$lib/data/storage/storage-types';
import {
  advanceDateDays,
  getDate,
  getDateKey,
  mergeStatistics,
  updateStatisticToStore
} from '$lib/functions/statistic-util';
import {
  getCurrentReadingGoal,
  mergeReadingGoals,
  readingGoalSortFunction
} from '$lib/data/reading-goal';
import { lastReadingGoalsModified$, readingGoal$ } from '$lib/data/store';

import type { BookCardProps } from '$lib/components/book-card/book-card-props';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type { BookStatistic } from '$lib/components/statistics/statistics-types';
import type { BooksDb } from '$lib/data/database/books-db/versions/books-db';
import type { IDBPDatabase } from 'idb';
import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
import type { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { getDefaultStatistic } from '$lib/components/book-reader/book-reading-tracker/tracker-domain';
import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
import { logger } from '$lib/data/logger';
import pLimit from 'p-limit';
import { replicationProgress$ } from '$lib/functions/replication/replication-progress';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

const LAST_ITEM_KEY = 0;

export class DatabaseService {
  #state = $state({
    isReady: false,
    listLoading: browser,
    dataList: [] as BookCardProps[],
    bookmarks: [] as BooksDbBookmarkData[],
    lastItemId: undefined as number | undefined,
    lastItemLoaded: false
  });

  /**
   * The unified library view — every BookCardProps row /manage shows.
   * Reads IndexedDB directly; no storage-handler involvement, since
   * cloud/fs handlers are sync endpoints, not library data sources.
   * Call notifyDataListChanged() after direct writes so this state refreshes
   * from IndexedDB.
   */
  get dataList() {
    return this.#state.dataList;
  }

  get bookmarks() {
    return this.#state.bookmarks;
  }

  get lastItemId() {
    return this.#state.lastItemId;
  }

  get lastItemLoaded() {
    return this.#state.lastItemLoaded;
  }

  get listLoading() {
    return this.#state.listLoading;
  }

  get isReady() {
    return this.#state.isReady;
  }

  #dataListRefreshId = 0;

  #bookmarksRefreshId = 0;

  #lastItemRefreshId = 0;

  async #fetchBookCards(): Promise<BookCardProps[]> {
    logger.clearHistory();
    const db = await this.db;
    const data = await db.getAll('data');
    return data.map((book) => ({
      id: book.id,
      title: book.title,
      imagePath: book.coverImage || '',
      characters: BaseStorageHandler.getBookCharacters(book.characters || 0, book.sections || []),
      lastBookModified: book.lastBookModified || 0,
      lastBookOpen: book.lastBookOpen || 0,
      isPlaceholder: !book.elementHtml,
      // Overlaid by /manage's book-card derivation from bookmark state.
      progress: 0,
      completed: false,
      lastBookmarkModified: 0
    }));
  }

  constructor(public db: Promise<IDBPDatabase<BooksDb>>) {
    db.then(
      () => (this.#state.isReady = true),
      (error: unknown) => showErrorDialog({ title: 'Error opening database', error })
    );

    if (browser) {
      this.notifyDataListChanged();
      this.notifyBookmarksChanged();
      void this.#refreshLastItem();
    }
  }

  /**
   * Use this when something has mutated the `data` store directly
   * (sync engine seeding placeholders, importers, etc.). `dataList`
   * reads IndexedDB on every refresh so no handler-cache invalidation is
   * needed.
   */
  notifyDataListChanged(): void {
    void this.#refreshBookCards();
  }

  notifyBookmarksChanged(): void {
    void this.#refreshBookmarks();
  }

  async #refreshBookCards() {
    const refreshId = ++this.#dataListRefreshId;

    this.#state.listLoading = true;

    try {
      const bookCards = await this.#fetchBookCards();
      if (refreshId === this.#dataListRefreshId) {
        this.#state.dataList = bookCards;
      }
    } catch (error) {
      if (refreshId === this.#dataListRefreshId) {
        showErrorDialog({ title: 'Error loading books', error });
        this.#state.dataList = [];
      }
    } finally {
      if (refreshId === this.#dataListRefreshId) {
        this.#state.listLoading = false;
      }
    }
  }

  async #refreshBookmarks() {
    const refreshId = ++this.#bookmarksRefreshId;

    try {
      const db = await this.db;
      const bookmarks = await db.getAll('bookmark');
      if (refreshId === this.#bookmarksRefreshId) {
        this.#state.bookmarks = bookmarks;
      }
    } catch (error) {
      if (refreshId === this.#bookmarksRefreshId) {
        showErrorDialog({ title: 'Error loading bookmarks', error });
        this.#state.bookmarks = [];
      }
    }
  }

  async #refreshLastItem() {
    const refreshId = ++this.#lastItemRefreshId;

    try {
      const db = await this.db;
      const lastItem = await db.get('lastItem', LAST_ITEM_KEY);
      if (refreshId === this.#lastItemRefreshId) {
        this.#state.lastItemId = lastItem?.dataId;
        this.#state.lastItemLoaded = true;
      }
    } catch (error) {
      if (refreshId === this.#lastItemRefreshId) {
        showErrorDialog({ title: 'Error loading last-opened book', error });
        this.#state.lastItemId = undefined;
        this.#state.lastItemLoaded = true;
      }
    }
  }

  async getLastModifiedForType(title: string, dataType: string) {
    const db = await this.db;
    const result = await db.get('lastModified', [title, dataType]);

    return result?.lastModifiedValue || 0;
  }

  async getData(dataId: number) {
    if (!Number.isNaN(dataId)) {
      const db = await this.db;
      return db.get('data', dataId);
    }
    return undefined;
  }

  async getDataByTitle(title: string) {
    if (title) {
      const db = await this.db;
      return db.getFromIndex('data', 'title', title);
    }

    return undefined;
  }

  async setFirstBookRead(
    bookTitle: string,
    startDaysHoursForTracker: number,
    existingStatistic?: BooksDbStatistic
  ) {
    const db = await this.db;

    let firstStatistic = existingStatistic;

    if (!firstStatistic) {
      firstStatistic = await db.get('statistic', IDBKeyRange.bound([bookTitle], [bookTitle, []]));
    }

    if (firstStatistic) {
      return [firstStatistic.dateKey, false];
    }

    const dateKey = getDateKey(startDaysHoursForTracker);
    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');

    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const newStatistic = getDefaultStatistic(bookTitle, dateKey);

      await statisticsStore.put(newStatistic);
      await lastModifiedStore.put({
        title: bookTitle,
        dataType: StorageDataType.STATISTICS,
        lastModifiedValue: newStatistic.lastStatisticModified
      });

      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }

    return [dateKey, true];
  }

  async upsertData(
    data: Omit<BooksDbBookData, 'id'>,
    saveBehavior: ReplicationSaveBehavior,
    skipTimestampFallback = true
  ) {
    const db = await this.db;

    let dataId: number;
    let bookData: BooksDbBookData;

    const tx = db.transaction('data', 'readwrite');
    const { store } = tx;
    const oldData = await store.index('title').get(data.title);

    if (oldData) {
      if (
        saveBehavior === ReplicationSaveBehavior.NewOnly &&
        // A placeholder row is never "up to date" — it has no content,
        // just metadata. Sync seeds placeholders with the remote's
        // lastBookModified so /manage can sort them, which means the
        // timestamp check below would otherwise skip the one write
        // that actually hydrates the book.
        oldData.elementHtml &&
        oldData.lastBookModified &&
        data.lastBookModified &&
        oldData.lastBookModified >= data.lastBookModified &&
        (oldData.lastBookOpen || 0) >= (data.lastBookOpen || 0)
      ) {
        bookData = oldData;
      } else {
        bookData = {
          ...data,
          id: oldData.id,
          // Sync source membership is local bookkeeping, not part of exported book data. Preserve
          // it when a pull hydrates/replaces an existing row so later source listings can still
          // prune books that disappeared from that source.
          lastSeenSourceInstanceId:
            data.lastSeenSourceInstanceId ?? oldData.lastSeenSourceInstanceId,
          ...(skipTimestampFallback
            ? { lastBookModified: data.lastBookModified, lastBookOpen: data.lastBookOpen }
            : {
                lastBookModified: data.lastBookModified || oldData.lastBookModified,
                lastBookOpen: data.lastBookOpen || oldData.lastBookOpen
              })
        };
        await store.put(bookData);
      }
    } else {
      // Until https://github.com/jakearchibald/idb/issues/150 resolves
      const bookDataWithoutKey: Omit<BooksDbBookData, 'id'> = data;
      dataId = await store.add(bookDataWithoutKey as BooksDbBookData);
      bookData = { ...data, id: dataId };
    }
    await tx.done;

    return bookData;
  }

  /**
   * Delete books from local IDB. Returns the ids that were actually
   * deleted. Throws AggregateError on any per-id failure (with the
   * partial-success list attached via `.cause` if you need it; the
   * caller's typical recovery is to re-derive UI state from a fresh
   * `getAll('data')` rather than parse the error).
   */
  async deleteData(
    dataIds: number[],
    idsToTitles: Map<number, string>,
    signal: AbortSignal,
    keepLocalStatistics: boolean
  ): Promise<number[]> {
    const db = await this.db;
    const lastItemObj = await db.get('lastItem', LAST_ITEM_KEY);
    const bookmarkIdData = await db.getAllKeys('bookmark');
    const lastItem = lastItemObj?.dataId;
    const bookmarkIds = new SvelteSet(bookmarkIdData);
    const deleted: number[] = [];
    const errors: Error[] = [];
    const limiter = pLimit(1);
    const tasks: Promise<void>[] = [];

    replicationProgress$.next({ progressBase: 1, maxProgress: dataIds.length });

    dataIds.forEach((id) =>
      tasks.push(
        limiter(async () => {
          try {
            signal.throwIfAborted();
            deleted.push(
              await this.#deleteSingleData(
                db,
                id,
                idsToTitles.get(id),
                { lastItem, bookmarkIds },
                !keepLocalStatistics
              )
            );
          } catch (error: any) {
            handleErrorDuringReplication(error, `Error deleting Book with id ${id}: `, [limiter]);
            errors.push(error);
          }
        })
      )
    );

    await Promise.all(tasks).catch((err) => {
      if (err.name === 'AbortError') throw err;
    });

    if (errors.length) {
      throw new AggregateError(errors, errors[0].message);
    }
    return deleted;
  }

  async getBookmark(dataId: number) {
    const db = await this.db;
    return db.get('bookmark', dataId);
  }

  async putBookmark(bookmarkData: BooksDbBookmarkData) {
    const db = await this.db;
    const result = await db.put('bookmark', bookmarkData);
    await this.#refreshBookmarks();
    return result;
  }

  async putLastItem(dataId: number) {
    const db = await this.db;
    const result = await db.put('lastItem', { dataId }, LAST_ITEM_KEY);
    this.#state.lastItemId = dataId;
    this.#state.lastItemLoaded = true;
    return result;
  }

  async deleteLastItem() {
    const db = await this.db;
    await db.delete('lastItem', LAST_ITEM_KEY);
    this.#state.lastItemId = undefined;
    this.#state.lastItemLoaded = true;
  }

  async #deleteSingleData(
    db: IDBPDatabase<BooksDb>,
    dataId: number,
    title: string | undefined,
    cachedData: { bookmarkIds: Set<number>; lastItem: number | undefined },
    shouldDeleteStatistics: boolean
  ) {
    const storeNames: ('data' | 'bookmark' | 'statistic' | 'lastItem' | 'lastModified')[] = [
      'data'
    ];
    const shouldDeleteLastItem = cachedData.lastItem === dataId;
    const shouldDeleteBookmark = cachedData.bookmarkIds.has(dataId);

    let bookTitle = title;

    if (shouldDeleteLastItem) {
      storeNames.push('lastItem');
    }

    if (shouldDeleteBookmark) {
      storeNames.push('bookmark');
    }

    if (shouldDeleteStatistics) {
      storeNames.push('statistic');
      storeNames.push('lastModified');
    }

    const tx = db.transaction(storeNames, 'readwrite');

    try {
      if (!bookTitle) {
        bookTitle = (await tx.objectStore('data').get(dataId))?.title;
      }

      if (shouldDeleteLastItem) {
        await tx.objectStore('lastItem').delete(LAST_ITEM_KEY);
      }

      if (shouldDeleteBookmark) {
        await tx.objectStore('bookmark').delete(dataId);
      }

      if (shouldDeleteStatistics && bookTitle) {
        await tx.objectStore('statistic').delete(IDBKeyRange.bound([bookTitle], [bookTitle, []]));
        await tx.objectStore('lastModified').delete([bookTitle, StorageDataType.STATISTICS]);
      }

      await tx.objectStore('data').delete(dataId);
      await tx.done;

      if (shouldDeleteLastItem) {
        this.#state.lastItemId = undefined;
        this.#state.lastItemLoaded = true;
      }
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }

    replicationProgress$.next({ progressToAdd: 1 });

    return dataId;
  }

  async saveStorageSource(storageSource: BooksDbStorageSource, oldName: string) {
    const db = await this.db;
    const tx = db.transaction(['storageSource'], 'readwrite');

    try {
      const store = tx.objectStore('storageSource');

      if (oldName && storageSource.name !== oldName) {
        await store.delete(oldName);
      }

      if (storageSource.name === oldName) {
        await store.put(storageSource);
      } else {
        await store.add(storageSource);
      }

      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async deleteStorageSource(toDelete: BooksDbStorageSource) {
    const db = await this.db;
    await db.delete('storageSource', toDelete.name);
  }

  async getStatisticsForBook(bookTitle: string) {
    const db = await this.db;

    return db.getAll('statistic', IDBKeyRange.bound([bookTitle], [bookTitle, []]));
  }

  async getStatisticForCompletedBook(bookTitle: string) {
    const db = await this.db;

    return db.getFromIndex('statistic', 'completedBook', [1, bookTitle]);
  }

  async getStatisticsForTimeWindow(startDate: string, endDate: string) {
    const db = await this.db;

    return db.getAllFromIndex('statistic', 'dateKey', IDBKeyRange.bound(startDate, endDate));
  }

  async getStatisticsUntilDate(bookTitle: string, maxDate: string) {
    const db = await this.db;

    const results = await db.getAllFromIndex(
      'statistic',
      'dateKey',
      IDBKeyRange.upperBound(maxDate)
    );

    return results.filter((result) => result.title === bookTitle);
  }

  async storeStatistics(
    bookTitle: string,
    statistics: BooksDbStatistic[],
    saveBehavior: ReplicationSaveBehavior,
    statisticsMergeMode: MergeMode,
    currentLastModified = Date.now()
  ) {
    const db = await this.db;

    let statisticsToStore: BooksDbStatistic[] = statistics;
    let newStatisticModified = currentLastModified;

    if (statisticsMergeMode === 'merge') {
      const existingStatistics = await this.getStatisticsForBook(bookTitle);

      statisticsToStore = mergeStatistics(
        statistics,
        existingStatistics,
        saveBehavior === ReplicationSaveBehavior.NewOnly
      );
    }

    ({ newStatisticModified, statisticsToStore } = updateStatisticToStore(
      statisticsToStore,
      newStatisticModified
    ));

    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');

    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      tasks.push(
        limiter(async () => {
          try {
            await statisticsStore.delete(IDBKeyRange.bound([bookTitle], [bookTitle, []]));
          } catch (error: any) {
            limiter.clearQueue();
            throw error;
          }
        })
      );

      statisticsToStore.forEach((statistic) =>
        tasks.push(
          limiter(async () => {
            try {
              await statisticsStore.put(statistic);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      tasks.push(
        limiter(async () => {
          try {
            await lastModifiedStore.put({
              title: bookTitle,
              dataType: StorageDataType.STATISTICS,
              lastModifiedValue: newStatisticModified
            });
          } catch (error: any) {
            limiter.clearQueue();

            throw error;
          }
        })
      );

      await Promise.all(tasks);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async updateStatistic(newStatistic: BookStatistic) {
    const db = await this.db;

    let existingStatistic = await db.get('statistic', [newStatistic.title, newStatistic.dateKey]);

    if (!existingStatistic) {
      throw new Error('Unable to find record in the database');
    }

    existingStatistic = {
      ...existingStatistic,
      charactersRead: newStatistic.charactersRead,
      readingTime: newStatistic.readingTime,
      minReadingSpeed: newStatistic.minReadingSpeed,
      altMinReadingSpeed: newStatistic.altMinReadingSpeed,
      lastReadingSpeed: newStatistic.lastReadingSpeed,
      maxReadingSpeed: newStatistic.maxReadingSpeed,
      lastStatisticModified: newStatistic.lastStatisticModified
    };

    // Same transaction as storeStatistics/setFirstBookRead: bump the
    // per-title lastModified row so the sync engine's source-side
    // up-to-date check (getFilenameForRecentCheck → getLastModifiedForType)
    // sees the edit and lets the ambient push run.
    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');
    try {
      await tx.objectStore('statistic').put(existingStatistic);
      await tx.objectStore('lastModified').put({
        title: newStatistic.title,
        dataType: StorageDataType.STATISTICS,
        lastModifiedValue: newStatistic.lastStatisticModified
      });
      await tx.done;
    } catch (err) {
      tx.abort();
      throw err;
    }
  }

  async clearZombieStatistics() {
    const db = await this.db;
    const books = await db.getAll('data');
    const titles = new SvelteSet(books.map((book) => book.title));
    const statistics = await db.getAll('statistic');
    const lastModifiedForStatistics = await db.getAll('lastModified');
    const statisticsToDelete: BooksDbStatistic[] = [];
    const lastModifiedItemsToDelete = new SvelteSet<string>();

    for (let index = 0, { length } = statistics; index < length; index += 1) {
      const entry = statistics[index];

      if (!titles.has(entry.title)) {
        statisticsToDelete.push(entry);
      }
    }

    for (let index = 0, { length } = lastModifiedForStatistics; index < length; index += 1) {
      const entry = lastModifiedForStatistics[index];

      if (!titles.has(entry.title)) {
        lastModifiedItemsToDelete.add(entry.title);
      }
    }

    await this.deleteStatistics(statisticsToDelete, [...lastModifiedItemsToDelete]);
  }

  async deleteStatistics(statistics: BooksDbStatistic[], lastModifiedTitlesToDelete: string[]) {
    if (!statistics.length && !lastModifiedTitlesToDelete.length) {
      return;
    }

    const db = await this.db;
    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');
    const titlesToDelete = new SvelteSet<string>();

    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      for (let index = 0, { length } = lastModifiedTitlesToDelete; index < length; index += 1) {
        titlesToDelete.add(lastModifiedTitlesToDelete[index]);
      }

      statistics.forEach((statistic) =>
        tasks.push(
          limiter(async () => {
            try {
              titlesToDelete.add(statistic.title);
              await statisticsStore.delete([statistic.title, statistic.dateKey]);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      [...titlesToDelete].forEach((titleToDelete) =>
        tasks.push(
          limiter(async () => {
            try {
              await lastModifiedStore.delete([titleToDelete, StorageDataType.STATISTICS]);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      await Promise.all(tasks);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async deleteStatisticEntries(
    bookTitles: string[],
    checkExistingData: boolean,
    startDateString = '',
    endDateString = ''
  ) {
    if (!bookTitles.length || (startDateString && !endDateString)) {
      throw new Error('Received invalid Arguments for deleteStatisticEntries');
    }

    const db = await this.db;
    const tx = db.transaction(['statistic', 'lastModified'], 'readwrite');

    try {
      const statisticsStore = tx.objectStore('statistic');
      const lastModifiedStore = tx.objectStore('lastModified');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];
      const dates: string[] = [];
      const lastModifiedValue = Date.now();
      const hadDataMap = new SvelteMap<string, boolean>();

      if (startDateString) {
        // eslint-disable-next-line prefer-const
        let { referenceDate, dateString } = advanceDateDays(getDate(startDateString), 0);

        while (dateString <= endDateString) {
          dates.push(dateString);
          ({ dateString } = advanceDateDays(referenceDate));
        }
      }

      bookTitles.forEach((bookTitle) => {
        if (dates.length) {
          dates.forEach((dateKey) => {
            tasks.push(
              limiter(async () => {
                try {
                  await statisticsStore.delete([bookTitle, dateKey]);
                } catch (error: any) {
                  limiter.clearQueue();

                  throw error;
                }
              })
            );
          });
        } else {
          tasks.push(
            limiter(async () => {
              try {
                const keyRange = IDBKeyRange.bound([bookTitle], [bookTitle, []]);

                if (checkExistingData && !hadDataMap.has(bookTitle)) {
                  const hadData = !!(await statisticsStore.getKey(keyRange));

                  hadDataMap.set(bookTitle, hadData);
                }

                await statisticsStore.delete(keyRange);
              } catch (error: any) {
                limiter.clearQueue();

                throw error;
              }
            })
          );
        }

        tasks.push(
          limiter(async () => {
            try {
              if (!checkExistingData || hadDataMap.get(bookTitle)) {
                await lastModifiedStore.put({
                  title: bookTitle,
                  dataType: StorageDataType.STATISTICS,
                  lastModifiedValue
                });
              }
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        );
      });

      await Promise.all(tasks);
      await tx.done;
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async getReadingGoals() {
    const db = await this.db;

    return db.getAll('readingGoal');
  }

  async getOpenReadingGoals() {
    const db = await this.db;

    return db.getAllFromIndex('readingGoal', 'goalEndDate', '');
  }

  async getCurrentClosedReadingGoal(referenceDate: string) {
    const db = await this.db;
    const readingGoals = await db.getAll('readingGoal', IDBKeyRange.upperBound(referenceDate));

    return readingGoals.find((readingGoal) => readingGoal.goalEndDate >= referenceDate);
  }

  async getReadingGoalsForDateWindow(startDate: string, newStartDate = '', endDate = '') {
    const readingGoals = await this.getReadingGoals();

    if (newStartDate) {
      return readingGoals.filter(
        (readingGoal) =>
          !readingGoal.goalEndDate ||
          (startDate >= readingGoal.goalStartDate && startDate <= readingGoal.goalEndDate) ||
          (readingGoal.goalStartDate >= startDate &&
            (!endDate || readingGoal.goalStartDate <= endDate)) ||
          (newStartDate >= readingGoal.goalStartDate && newStartDate <= readingGoal.goalEndDate) ||
          readingGoal.goalStartDate >= newStartDate
      );
    }

    return readingGoals.filter(
      (readingGoal) =>
        !readingGoal.goalEndDate ||
        (startDate >= readingGoal.goalStartDate && startDate <= readingGoal.goalEndDate) ||
        (readingGoal.goalStartDate >= startDate &&
          (!endDate || readingGoal.goalStartDate <= endDate))
    );
  }

  async updateReadingGoals(
    readingGoalsToDelete: string[],
    readingGoalsToInsert: BooksDbReadingGoal[]
  ) {
    if (!readingGoalsToDelete.length && !readingGoalsToInsert.length) {
      return;
    }

    const db = await this.db;
    const tx = db.transaction(['readingGoal'], 'readwrite');

    try {
      const store = tx.objectStore('readingGoal');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      readingGoalsToDelete.forEach((readingGoal) =>
        tasks.push(
          limiter(async () => {
            try {
              await store.delete(readingGoal);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      readingGoalsToInsert.forEach((readingGoal) =>
        tasks.push(
          limiter(async () => {
            try {
              await store.put(readingGoal);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      await Promise.all(tasks);
      await tx.done;

      lastReadingGoalsModified$.next(Date.now());
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async storeReadingGoals(
    readingGoals: BooksDbReadingGoal[],
    saveBehavior: ReplicationSaveBehavior,
    readingGoalsMergeMode: MergeMode,
    lastGoalModified: number
  ) {
    const db = await this.db;

    let readingGoalsToStore: BooksDbReadingGoal[] = readingGoals;
    let newReadingGoalModified = lastGoalModified;

    if (readingGoalsMergeMode === 'merge') {
      const existingReadingGoals = await this.getReadingGoals();

      ({ readingGoalsToStore, newReadingGoalModified } = mergeReadingGoals(
        readingGoals,
        existingReadingGoals,
        saveBehavior === ReplicationSaveBehavior.NewOnly,
        newReadingGoalModified
      ));
    }

    const tx = db.transaction(['readingGoal'], 'readwrite');

    try {
      const readingGoalStore = tx.objectStore('readingGoal');
      const limiter = pLimit(1);
      const tasks: Promise<void>[] = [];

      readingGoalsToStore.sort(readingGoalSortFunction);

      tasks.push(
        limiter(async () => {
          try {
            await readingGoalStore.clear();
          } catch (error: any) {
            limiter.clearQueue();

            throw error;
          }
        })
      );

      readingGoalsToStore.forEach((readingGoal) =>
        tasks.push(
          limiter(async () => {
            try {
              await readingGoalStore.put(readingGoal);
            } catch (error: any) {
              limiter.clearQueue();

              throw error;
            }
          })
        )
      );

      await Promise.all(tasks);
      await tx.done;

      lastReadingGoalsModified$.next(newReadingGoalModified);

      const currentUserGoal = await getCurrentReadingGoal();

      readingGoal$.next(currentUserGoal);
    } catch (error: any) {
      try {
        tx.abort();
        await tx.done;
      } catch (_) {
        // no-op
      }

      throw error;
    }
  }

  async deleteReadingGoal(dateKey?: string) {
    const db = await this.db;

    if (dateKey) {
      await db.delete('readingGoal', dateKey);
    } else {
      await db.clear('readingGoal');
    }

    lastReadingGoalsModified$.next(Date.now());
  }
}
