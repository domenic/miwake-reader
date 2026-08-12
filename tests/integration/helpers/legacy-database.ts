import type { BrowserContext } from '@playwright/test';

export interface LegacyV7Book {
  id: number;
  title: string;
  elementHtml: string;
  characters?: number;
  lastBookModified?: number;
  lastBookOpen?: number;
}

export interface LegacyV7Bookmark {
  dataId: number;
  progress: number;
  exploredCharCount?: number;
  lastBookmarkModified: number;
  completed?: boolean;
}

export interface LegacyV7Seed {
  books: LegacyV7Book[];
  bookmarks?: LegacyV7Bookmark[];
  lastItem?: { dataId: number };
}

/**
 * Init script: creates the pre-v8 `books` IndexedDB (schema version 7, `bookmark` keyed by the
 * numeric `dataId`, `lastItem` holding `{ dataId }`) and seeds it, before any app code runs. On
 * the next load the app's own `openDB(..., 8)` migrates it in place, so specs can assert the
 * migration's outcome through the UI. Call before the first navigation of the context.
 *
 * The versionchange transaction created by `indexedDB.open('books', 7)` keeps the app's version-8
 * open blocked until this connection closes, so seeding always completes first. On subsequent
 * loads (DB already at v8) the open fails with `VersionError` and the script is a no-op.
 */
export async function plantLegacyV7Database(context: BrowserContext, seed: LegacyV7Seed) {
  await context.addInitScript((seedData: LegacyV7Seed) => {
    const request = indexedDB.open('books', 7);
    request.onupgradeneeded = () => {
      const db = request.result;
      const transaction = request.transaction!;

      // Mirrors the store shapes the app's factory created at schema version 7.
      const dataStore = db.createObjectStore('data', { keyPath: 'id', autoIncrement: true });
      dataStore.createIndex('title', 'title');
      db.createObjectStore('bookmark', { keyPath: 'dataId' });
      db.createObjectStore('lastItem');
      db.createObjectStore('storageSource', { keyPath: 'name' });
      const statisticsStore = db.createObjectStore('statistic', { keyPath: ['title', 'dateKey'] });
      statisticsStore.createIndex('dateKey', 'dateKey');
      statisticsStore.createIndex('completedBook', ['completedBook', 'title']);
      const readingGoalsStore = db.createObjectStore('readingGoal', { keyPath: 'goalStartDate' });
      readingGoalsStore.createIndex('goalEndDate', 'goalEndDate');
      db.createObjectStore('lastModified', { keyPath: ['title', 'dataType'] });

      for (const book of seedData.books) {
        transaction.objectStore('data').put({
          styleSheet: '',
          blobs: {},
          hasThumb: false,
          characters: 0,
          sections: [],
          lastBookModified: 0,
          lastBookOpen: 0,
          ...book
        });
      }
      for (const bookmark of seedData.bookmarks ?? []) {
        transaction.objectStore('bookmark').put(bookmark);
      }
      if (seedData.lastItem) {
        transaction.objectStore('lastItem').put(seedData.lastItem, 0);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      db.close();
    };
    request.onerror = () => {
      // DB already upgraded past v7 by a previous load — nothing to plant.
    };
  }, seed);
}
