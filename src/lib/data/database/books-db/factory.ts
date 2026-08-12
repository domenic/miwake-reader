import type { IDBPDatabase } from 'idb';

import type { BooksDb } from './versions/books-db';
import { openDB } from 'idb';
import upgradeBooksDbFromV2 from './versions/v2/upgrade';
import upgradeBooksDbToV8 from './versions/v8/upgrade';

export function createBooksDb(name = 'books') {
  const dbPromise = openDB<BooksDb>(name, 8, {
    async upgrade(oldDb, oldVersion, newVersion, transaction) {
      if (oldVersion === 0) {
        createFreshSchema(oldDb);
        return;
      }

      // The stages below are cumulative: a DB at any old version runs every
      // stage it is missing. (There is no v1 stage — localForage created its
      // DB at version 2, and fresh installs jump straight from 0. There are
      // also no v5/v6 stages: v6 added the audioBook/subtitle/handle stores
      // and v7 removed them again, so creating them just to delete them
      // would be pointless.)
      if (oldVersion < 3) {
        await upgradeBooksDbFromV2(oldDb, oldVersion, newVersion, transaction);
      }
      if (oldVersion < 7) {
        for (const storeName of ['audioBook', 'subtitle', 'handle'] as const) {
          if (oldDb.objectStoreNames.contains(storeName as never)) {
            oldDb.deleteObjectStore(storeName as never);
          }
        }
      }
      if (oldVersion < 8) {
        // The pre-v8 upgrade ran only ONE version step per open, so a DB
        // that skipped versions (e.g. a v3 DB first opened by a v6 build)
        // may be stamped with a recent version yet lack these stores.
        // Creating them here is both the v3→v5 stage and the repair pass.
        createStorageSourceStore(oldDb);
        createStatisticsStores(oldDb);
        await upgradeBooksDbToV8(oldDb, transaction);
      }
    },
    blocking() {
      // A newer app version in another tab is waiting to upgrade the schema.
      // Close so it can proceed; this stale tab errors on its next DB access
      // instead of holding the upgrade hostage.
      dbPromise.then((db) => db.close());
    }
  });
  return dbPromise;
}

function createFreshSchema(db: IDBPDatabase<BooksDb>) {
  const dataStore = db.createObjectStore('data', {
    keyPath: 'id',
    autoIncrement: true
  });
  dataStore.createIndex('title', 'title', { unique: true });

  db.createObjectStore('bookmark', {
    keyPath: 'title'
  });

  db.createObjectStore('lastItem');

  createStorageSourceStore(db);
  createStatisticsStores(db);
}

function createStorageSourceStore(db: IDBPDatabase<BooksDb>) {
  if (db.objectStoreNames.contains('storageSource')) {
    return;
  }
  db.createObjectStore('storageSource', {
    keyPath: 'name'
  });
}

function createStatisticsStores(db: IDBPDatabase<BooksDb>) {
  if (!db.objectStoreNames.contains('statistic')) {
    const statisticsStore = db.createObjectStore('statistic', {
      keyPath: ['title', 'dateKey']
    });

    statisticsStore.createIndex('dateKey', 'dateKey');
    statisticsStore.createIndex('completedBook', ['completedBook', 'title']);
  }

  if (!db.objectStoreNames.contains('readingGoal')) {
    const readingGoalsStore = db.createObjectStore('readingGoal', {
      keyPath: 'goalStartDate'
    });

    readingGoalsStore.createIndex('goalEndDate', 'goalEndDate');
  }

  if (!db.objectStoreNames.contains('lastModified')) {
    db.createObjectStore('lastModified', {
      keyPath: ['title', 'dataType']
    });
  }
}
