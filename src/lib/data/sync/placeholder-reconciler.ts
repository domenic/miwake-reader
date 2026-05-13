import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import type { SyncTitle } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import { logger } from '$lib/data/logger';

/**
 * Local-side bookkeeping for the placeholder rows that mirror a sync
 * location's title list.
 *
 * Used by both the sync engine (boot reconcile, force resync,
 * book-open hydration paths) and the source manager (fresh connect,
 * switch, disconnect). Lives in its own module so source switching
 * doesn't have to depend on the wider sync engine surface.
 */

/**
 * Apply a remote book list to local state: seed placeholders for every
 * remote-listed title, prune ones the source didn't list. Callers pass
 * a list they've already validated as the authoritative current view —
 * a transient permission / network failure must short-circuit before
 * here so we don't accidentally prune everything.
 */
export async function reconcilePlaceholders(books: SyncTitle[]): Promise<void> {
  const ensured = await ensurePlaceholders(books);
  const reachable = new Set(books.map((b) => b.title));
  const pruned = await pruneUnreachablePlaceholders(reachable);
  if (ensured > 0 || pruned > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * Write a placeholder row into local IndexedDB for any title that
 * isn't already present, and refresh the cover on existing
 * placeholders (cloud thumbnail URLs are session-scoped, so we
 * re-store the fresh one each reconcile). Returns the count of rows
 * touched.
 */
export async function ensurePlaceholders(remoteCards: ReadonlyArray<SyncTitle>): Promise<number> {
  let touched = 0;
  const db = await database.db;

  for (const card of remoteCards) {
    const existing = await database.getDataByTitle(card.title);

    if (existing) {
      // Already-downloaded books get their cover via the full content
      // pull; only placeholders need their cover refreshed here.
      if (!existing.elementHtml && card.coverImage && existing.coverImage !== card.coverImage) {
        await db.put('data', { ...existing, coverImage: card.coverImage });
        touched += 1;
      }
      // Refresh the placeholder bookmark so /manage's progress / bookmarked
      // sort reflects what the source currently advertises. Real bookmarks
      // (placeholder !== true) are off-limits — they represent the user's
      // actual reading position and are reconciled by the replicator.
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
        lastBookOpen: card.lastBookOpen || 0
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
 * Drop placeholder rows whose titles aren't in `reachableTitles`. The
 * cascade-delete via database.deleteData also clears companion
 * bookmark / lastItem rows. Pass an empty set to drop all placeholders
 * (used by disconnect, since the single-location model has no
 * remaining source to fall back on).
 */
export async function pruneUnreachablePlaceholders(reachableTitles: Set<string>): Promise<number> {
  const db = await database.db;
  const allBooks = await db.getAll('data');

  const ids: number[] = [];
  const idsToTitles = new Map<number, string>();
  for (const book of allBooks) {
    if (!book.elementHtml && !reachableTitles.has(book.title)) {
      ids.push(book.id);
      idsToTitles.set(book.id, book.title);
    }
  }
  if (ids.length === 0) return 0;

  // Defer to database.deleteData so every related store is cleaned up
  // in one transaction: bookmark (placeholder bookmarks), lastItem
  // (if the user opened this placeholder, b/+page.svelte writes
  // lastItem), statistic / lastModified (only present for hydrated
  // books, skipped via keepLocalStatistics here as a no-op safety
  // belt).
  const deleted = await database.deleteData(
    ids,
    idsToTitles,
    new AbortController().signal,
    /* keepLocalStatistics */ true
  );
  return deleted.length;
}
