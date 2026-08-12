import type { IDBPDatabase, IDBPTransaction, StoreNames } from 'idb';

import type { BooksDb } from '../books-db';
import type BooksDbV7 from '../v7/books-db-v7';

type BookmarkV7 = BooksDbV7['bookmark']['value'];

/**
 * Re-keys the book-adjacent stores by canonical title, making the title the
 * single book identity (matching `statistic`, `lastModified`, and the sync
 * folder layout) and demoting the `data` store's autoincrement id to an
 * internal surrogate key:
 *
 * - `data`: same-title rows are deduped (possible only in libraries migrated
 *   from the pre-v3 localForage era) and the `title` index becomes unique.
 *   Rows are otherwise untouched — they are large (book HTML + blobs), and
 *   rewriting them inside the atomic versionchange transaction would risk
 *   quota aborts for no benefit.
 * - `bookmark`: keyPath changes from `dataId` to `title`; orphaned rows are
 *   dropped, and rows collapsed by the `data` dedupe keep the newest bookmark.
 * - `lastItem`: value changes from `{ dataId }` to `{ title }`.
 *
 * Every `await` in here must be on an `idb`-wrapped IDB request — awaiting
 * anything else lets the versionchange transaction auto-commit (see
 * `v2/upgrade.ts`, the precedent for this pattern).
 */
export default async function upgradeBooksDbToV8(
  oldDb: IDBPDatabase<BooksDb>,
  transaction: IDBPTransaction<BooksDb, StoreNames<BooksDb>[], 'versionchange'>
) {
  const transactionV7 = transaction as unknown as IDBPTransaction<
    BooksDbV7,
    StoreNames<BooksDbV7>[],
    'versionchange'
  >;

  // A key cursor over the `title` index yields `(title, id)` pairs without
  // materializing the heavy row values. Rows whose `title` is not a valid key
  // are absent from the index; their bookmarks are dropped as orphans below.
  const titlesById = new Map<number, string>();
  const idsByTitle = new Map<string, number[]>();
  {
    let cursor = await transaction.objectStore('data').index('title').openKeyCursor();
    while (cursor) {
      const title = cursor.key;
      titlesById.set(cursor.primaryKey, title);
      const ids = idsByTitle.get(title);
      if (ids) {
        ids.push(cursor.primaryKey);
      } else {
        idsByTitle.set(title, [cursor.primaryKey]);
      }
      cursor = await cursor.continue();
    }
  }

  // Dedupe `data` rows sharing a title: keep the most recently opened
  // (falling back to most recently modified, then highest id). Deletes must
  // finish before the unique index is created, or that step aborts the
  // upgrade with a `ConstraintError`.
  const winningIdByTitle = new Map<string, number>();
  for (const [title, ids] of idsByTitle) {
    if (ids.length === 1) {
      winningIdByTitle.set(title, ids[0]);
      continue;
    }
    let winner: { id: number; lastBookOpen: number; lastBookModified: number } | undefined;
    for (const id of ids) {
      const row = await transaction.objectStore('data').get(id);
      if (!row) {
        continue;
      }
      if (!winner || compareBooks(row, winner) > 0) {
        winner = row;
      }
    }
    if (!winner) {
      continue;
    }
    winningIdByTitle.set(title, winner.id);
    for (const id of ids) {
      if (id !== winner.id) {
        await transaction.objectStore('data').delete(id);
      }
    }
  }

  // Re-key `bookmark` by title. The rows are small (scroll positions and
  // progress numbers), so buffering them all is fine — unlike `data` rows.
  const oldBookmarks: BookmarkV7[] = await transactionV7.objectStore('bookmark').getAll();
  oldDb.deleteObjectStore('bookmark');
  // Writes must go through the store handle returned by `createObjectStore`;
  // a `transaction.objectStore('bookmark')` handle from before the delete
  // would be stale.
  const bookmarkStore = oldDb.createObjectStore('bookmark', { keyPath: 'title' });
  const bookmarksByTitle = new Map<string, BookmarkV7[]>();
  for (const bookmark of oldBookmarks) {
    const title = titlesById.get(bookmark.dataId);
    if (title === undefined) {
      continue;
    }
    const bookmarks = bookmarksByTitle.get(title);
    if (bookmarks) {
      bookmarks.push(bookmark);
    } else {
      bookmarksByTitle.set(title, [bookmark]);
    }
  }
  for (const [title, candidates] of bookmarksByTitle) {
    let winner = candidates[0];
    for (const candidate of candidates.slice(1)) {
      if (compareBookmarks(candidate, winner, winningIdByTitle.get(title)) > 0) {
        winner = candidate;
      }
    }
    const { dataId: _dataId, ...rest } = winner;
    await bookmarkStore.put({ ...rest, title });
  }

  // `lastItem` keeps its store shape (out-of-line key 0); only the value
  // changes from `{ dataId }` to `{ title }`.
  const lastItem = await transactionV7.objectStore('lastItem').get(0);
  if (lastItem) {
    const title = titlesById.get(lastItem.dataId);
    if (title === undefined) {
      await transaction.objectStore('lastItem').delete(0);
    } else {
      await transaction.objectStore('lastItem').put({ title }, 0);
    }
  }

  const dataStore = transaction.objectStore('data');
  dataStore.deleteIndex('title');
  dataStore.createIndex('title', 'title', { unique: true });
}

function compareBooks(
  a: { id: number; lastBookOpen: number; lastBookModified: number },
  b: { id: number; lastBookOpen: number; lastBookModified: number }
) {
  return (
    (a.lastBookOpen || 0) - (b.lastBookOpen || 0) ||
    (a.lastBookModified || 0) - (b.lastBookModified || 0) ||
    a.id - b.id
  );
}

function compareBookmarks(a: BookmarkV7, b: BookmarkV7, winningDataId: number | undefined) {
  return (
    (a.lastBookmarkModified || 0) - (b.lastBookmarkModified || 0) ||
    Number(a.dataId === winningDataId) - Number(b.dataId === winningDataId) ||
    a.dataId - b.dataId
  );
}
