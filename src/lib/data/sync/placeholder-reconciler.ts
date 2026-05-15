import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import type { SyncTitle } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import { logger } from '$lib/data/logger';
import { syncState } from '$lib/data/sync/sync-store.svelte';

/**
 * Membership bookkeeping for the local mirror of a connected sync
 * source.
 *
 * The "membership" relation lives on each book row as
 * `lastSeenSourceInstanceId`: when set, the row has been confirmed
 * (via listing or push) on the source whose `sourceInstanceId`
 * matches. Source rotation invalidates by id mismatch — there is no
 * sticky flag to clear, which is what previously made the prune
 * primitive easy to misuse.
 *
 * The three public entry points encode the three semantic operations
 * the rest of the code needs:
 *   - `reconcileAfterAuthoritativeListing`: a listing IS the source's
 *     authoritative view right now. Seed placeholders for new titles,
 *     stamp listed rows with the current id, drop placeholders + rows
 *     known to be on THIS source but absent from the listing.
 *   - `detachSourceKeepingLibrary`: the user disconnected without
 *     wiping. Drop placeholders (they're metadata-only and can't
 *     exist without a source); keep every downloaded book.
 *   - `markBookMirroredToSource`: a push successfully wrote a book to
 *     the active source. Stamp the row so a later listing-driven
 *     reconcile can detect cross-device deletion.
 *
 * Each public entry point guards on the active `sourceInstanceId`
 * before mutating IDB — if the active source rotated between when
 * the caller captured the id and when the work executes, the
 * operation no-ops rather than writing under stale identity.
 */

/**
 * Apply an authoritative listing from a specific source to local
 * state.
 *
 * Behavior:
 *   - For each listed title: ensure a local row (placeholder if none
 *     existed) and stamp `lastSeenSourceInstanceId = expectedSourceInstanceId`.
 *   - Prune:
 *       * placeholder rows whose title is not in the listing
 *         (placeholders only ever come from listings, so an absent
 *         title means the source removed them),
 *       * downloaded rows where `lastSeenSourceInstanceId ===
 *         expectedSourceInstanceId` and the title is not in the
 *         listing (cross-device deletion).
 *   - Downloaded rows whose `lastSeenSourceInstanceId` is missing or
 *     belongs to a different source instance are LEFT ALONE — those
 *     are local-only books that haven't been pushed yet, or rows
 *     that survived a source switch and will get re-stamped on the
 *     next push to the new source.
 *
 * Bail out if `syncState.location?.sourceInstanceId` no longer
 * matches `expectedSourceInstanceId` (the user switched sources
 * mid-flight).
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
 * Drop placeholders only, leaving downloaded books and their
 * companion data intact. Used by disconnect-without-wipe: the source
 * is gone so placeholders (which are pure metadata derived from the
 * source's listing) have nothing to represent, but the user kept
 * their library.
 */
export async function detachSourceKeepingLibrary(): Promise<void> {
  const db = await database.db;
  const allBooks = await db.getAll('data');

  const ids: number[] = [];
  const idsToTitles = new Map<number, string>();
  for (const book of allBooks) {
    if (!book.elementHtml) {
      ids.push(book.id);
      idsToTitles.set(book.id, book.title);
    }
  }
  if (ids.length === 0) return;

  const deleted = await database.deleteData(
    ids,
    idsToTitles,
    new AbortController().signal,
    /* keepLocalStatistics */ true
  );
  if (deleted.length > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * Record that a book was successfully mirrored to the active source.
 * Guards against rotation: if `syncState.location.sourceInstanceId`
 * no longer matches `expectedSourceInstanceId`, the write is
 * skipped (the caller's push completed against a source that's no
 * longer active).
 */
export async function markBookMirroredToSource(
  bookId: number,
  expectedSourceInstanceId: string
): Promise<void> {
  if (!isStillActive(expectedSourceInstanceId)) return;
  const db = await database.db;
  const book = await db.get('data', bookId);
  if (!book) return;
  if (book.lastSeenSourceInstanceId === expectedSourceInstanceId) return;
  if (!isStillActive(expectedSourceInstanceId)) return;
  await db.put('data', { ...book, lastSeenSourceInstanceId: expectedSourceInstanceId });
}

function isStillActive(expectedSourceInstanceId: string): boolean {
  return syncState.location?.sourceInstanceId === expectedSourceInstanceId;
}

/**
 * Write a placeholder row into local IndexedDB for any title that
 * isn't already present, and stamp every listed row's
 * lastSeenSourceInstanceId with the active source's id. Returns the
 * count of rows touched.
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
        // Already-downloaded books get their cover via the full
        // content pull; only placeholders need their cover refreshed
        // here.
        await db.put('data', {
          ...existing,
          ...(coverChanged ? { coverImage: card.coverImage } : {}),
          lastSeenSourceInstanceId: sourceInstanceId
        });
        if (coverChanged) touched += 1;
      }
      // Refresh the placeholder bookmark so /manage's progress /
      // bookmarked sort reflects what the source currently
      // advertises. Real bookmarks (placeholder !== true) are
      // off-limits — they represent the user's actual reading
      // position and are reconciled by the replicator.
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

/**
 * Drop rows the active source's authoritative listing implies are
 * gone:
 *   - Any placeholder whose title isn't in the listing (placeholders
 *     are mirrors of the source's listing; absence = removal).
 *   - Any downloaded row stamped with `expectedSourceInstanceId`
 *     whose title isn't in the listing (cross-device deletion).
 */
async function pruneAgainstAuthoritativeListing(
  listing: ReadonlyArray<SyncTitle>,
  expectedSourceInstanceId: string
): Promise<number> {
  if (!isStillActive(expectedSourceInstanceId)) return 0;
  const db = await database.db;
  const allBooks = await db.getAll('data');
  const reachable = new Set(listing.map((b) => b.title));

  const ids: number[] = [];
  const idsToTitles = new Map<number, string>();
  for (const book of allBooks) {
    if (reachable.has(book.title)) continue;
    const isPlaceholder = !book.elementHtml;
    const wasOnActiveSource = book.lastSeenSourceInstanceId === expectedSourceInstanceId;
    if (isPlaceholder || wasOnActiveSource) {
      ids.push(book.id);
      idsToTitles.set(book.id, book.title);
    }
  }
  if (ids.length === 0) return 0;
  if (!isStillActive(expectedSourceInstanceId)) return 0;

  const deleted = await database.deleteData(
    ids,
    idsToTitles,
    new AbortController().signal,
    /* keepLocalStatistics */ true
  );
  return deleted.length;
}
