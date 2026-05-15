import type {
  BooksDbBookData,
  BooksDbBookmarkData
} from '$lib/data/database/books-db/versions/books-db';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import type { SyncTitle } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import { logger } from '$lib/data/logger';
import { syncState } from '$lib/data/sync/sync-store.svelte';

/**
 * Membership bookkeeping for the local mirror of a connected sync
 * source.
 *
 * Each book row carries `lastSeenSourceInstanceId`: the id of the
 * source under which it was last confirmed (via listing or push).
 * Source rotation invalidates by id mismatch — no sticky flag to
 * clear, which is what previously made the prune primitive easy to
 * misuse.
 */

/**
 * Apply an authoritative listing for a specific source to local
 * state: ensure placeholders for new titles, stamp listed rows with
 * the active id, drop placeholders + rows last seen on THIS source
 * but absent from the listing. Rows last seen on a different (or
 * no) source are left alone — they'll be re-stamped on the next
 * push to the active source.
 *
 * No-ops if the active source has rotated between the caller
 * capturing the id and the work executing.
 */
export async function reconcileAfterAuthoritativeListing(
  listing: ReadonlyArray<SyncTitle>,
  expectedSourceInstanceId: string
): Promise<void> {
  if (!isStillActive(expectedSourceInstanceId)) return;
  const ensured = await ensurePlaceholders(listing, expectedSourceInstanceId);
  if (!isStillActive(expectedSourceInstanceId)) return;
  const pruned = await pruneAgainstAuthoritativeListing(listing, expectedSourceInstanceId);
  if (ensured > 0 || pruned > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * Drop placeholders (downloaded books stay). Used by
 * disconnect-without-wipe: the source is gone so placeholder rows —
 * pure metadata derived from a listing — have nothing left to
 * represent.
 */
export async function detachSourceKeepingLibrary(): Promise<void> {
  const deleted = await deleteMatchingBooks((book) => !book.elementHtml);
  if (deleted > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * Stamp `lastSeenSourceInstanceId` on a book whose push to the
 * given source just succeeded. Reads + writes happen in one
 * readwrite transaction, so concurrent writers (replicator, delete
 * paths) can't be clobbered by a stale-read-then-write race. No-ops
 * if the active source rotated between when the caller captured
 * the id and now.
 */
export async function markBookMirroredToSource(
  bookId: number,
  expectedSourceInstanceId: string
): Promise<void> {
  if (!isStillActive(expectedSourceInstanceId)) return;
  const db = await database.db;
  const tx = db.transaction('data', 'readwrite');
  const store = tx.objectStore('data');
  const book = await store.get(bookId);
  if (!book || book.lastSeenSourceInstanceId === expectedSourceInstanceId) {
    await tx.done;
    return;
  }
  if (!isStillActive(expectedSourceInstanceId)) {
    await tx.done;
    return;
  }
  await store.put({ ...book, lastSeenSourceInstanceId: expectedSourceInstanceId });
  await tx.done;
}

function isStillActive(expectedSourceInstanceId: string): boolean {
  return syncState.location?.sourceInstanceId === expectedSourceInstanceId;
}

/**
 * Scan every book row, delete those where `predicate` returns true.
 * Companion bookmark / lastItem / statistic rows are cascade-cleaned
 * via `database.deleteData`. Returns the count actually deleted.
 *
 * `precheck` runs after the scan but before any delete, so callers
 * can bail (e.g. on source rotation) without leaving partial
 * mutations. Returning `false` skips the deletion entirely.
 */
async function deleteMatchingBooks(
  predicate: (book: BooksDbBookData) => boolean,
  precheck?: () => boolean
): Promise<number> {
  const db = await database.db;
  const allBooks = await db.getAll('data');
  const ids: number[] = [];
  const idsToTitles = new Map<number, string>();
  for (const book of allBooks) {
    if (predicate(book)) {
      ids.push(book.id);
      idsToTitles.set(book.id, book.title);
    }
  }
  if (ids.length === 0) return 0;
  if (precheck && !precheck()) return 0;
  const deleted = await database.deleteData(
    ids,
    idsToTitles,
    new AbortController().signal,
    /* keepLocalStatistics */ true
  );
  return deleted.length;
}

/**
 * For each listed title, create a placeholder row if none exists,
 * and stamp the row's `lastSeenSourceInstanceId` with the active id.
 * Refreshes the placeholder cover when the source advertises a
 * different one. Returns the count of rows touched.
 */
async function ensurePlaceholders(
  remoteCards: ReadonlyArray<SyncTitle>,
  sourceInstanceId: string
): Promise<number> {
  let touched = 0;
  const db = await database.db;

  for (const card of remoteCards) {
    if (!isStillActive(sourceInstanceId)) return touched;
    const existing = await database.getDataByTitle(card.title);

    if (existing) {
      const coverChanged =
        !existing.elementHtml && card.coverImage && existing.coverImage !== card.coverImage;
      const stampStale = existing.lastSeenSourceInstanceId !== sourceInstanceId;
      if (coverChanged || stampStale) {
        await db.put('data', {
          ...existing,
          ...(coverChanged ? { coverImage: card.coverImage } : {}),
          lastSeenSourceInstanceId: sourceInstanceId
        });
        if (coverChanged) touched += 1;
      }
      // Refresh the placeholder bookmark so /manage's progress /
      // bookmarked sort reflects what the source advertises. Real
      // bookmarks (placeholder !== true) represent the user's actual
      // reading position and are reconciled by the replicator, not
      // here.
      if (!existing.elementHtml) {
        const bookmark = await database.getBookmark(existing.id);
        if (!bookmark || bookmark.placeholder) {
          await maybeWritePlaceholderBookmark(existing.id, card, bookmark);
        }
      }
      continue;
    }

    logger.debug(
      `ensurePlaceholders: no local record for ${JSON.stringify(card.title)}, creating placeholder`
    );

    const stored = await database.upsertData(
      {
        title: card.title,
        elementHtml: '',
        styleSheet: '',
        blobs: {},
        coverImage: card.coverImage || '',
        hasThumb: !!card.coverImage,
        characters: card.characters || 0,
        sections: [],
        lastBookModified: card.lastBookModified || 0,
        lastBookOpen: card.lastBookOpen || 0,
        lastSeenSourceInstanceId: sourceInstanceId
      },
      ReplicationSaveBehavior.NewOnly
    );
    await maybeWritePlaceholderBookmark(stored.id, card);
    touched += 1;
  }

  return touched;
}

async function maybeWritePlaceholderBookmark(
  dataId: number,
  card: SyncTitle,
  existing?: BooksDbBookmarkData
) {
  if (!card.lastBookmarkModified && !card.progress && !card.completed) {
    // Source has no progress file for this title — nothing to seed.
    return;
  }
  if (
    existing &&
    existing.progress === (card.progress ?? 0) &&
    existing.lastBookmarkModified === (card.lastBookmarkModified ?? 0)
  ) {
    // Already in sync with what the source advertises.
    return;
  }
  await database.putBookmark({
    dataId,
    progress: card.progress ?? 0,
    lastBookmarkModified: card.lastBookmarkModified ?? 0,
    completed: !!card.completed,
    placeholder: true
  });
}

async function pruneAgainstAuthoritativeListing(
  listing: ReadonlyArray<SyncTitle>,
  expectedSourceInstanceId: string
): Promise<number> {
  if (!isStillActive(expectedSourceInstanceId)) return 0;
  const reachable = new Set(listing.map((b) => b.title));
  return deleteMatchingBooks(
    (book) => {
      if (reachable.has(book.title)) return false;
      const isPlaceholder = !book.elementHtml;
      const wasOnActiveSource = book.lastSeenSourceInstanceId === expectedSourceInstanceId;
      return isPlaceholder || wasOnActiveSource;
    },
    () => isStillActive(expectedSourceInstanceId)
  );
}
