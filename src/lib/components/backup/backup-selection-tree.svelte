<script lang="ts">
  import type { BackupBook, BackupCatalog, BackupSelection } from './backup-types';

  interface Props {
    catalog: BackupCatalog;
    /** Set of item IDs that are disabled because the source doesn't contain them. */
    disabledItems?: { appSettings?: boolean; readingGoals?: boolean; books?: Set<number> };
    selection: BackupSelection;
    onchange: (next: BackupSelection) => void;
  }

  let { catalog, disabledItems = {}, selection, onchange }: Props = $props();

  function isBookSelected(book: BackupBook) {
    return selection.perBook.has(book.id);
  }

  function updatePerBookEntry(
    book: BackupBook,
    update: Partial<{ book: boolean; bookmarks: boolean; statistics: boolean }>
  ) {
    const next = { ...selection, perBook: new Map(selection.perBook) };
    const existing = next.perBook.get(book.id) ?? {
      book: true as const,
      bookmarks: false,
      statistics: false
    };

    const merged = { ...existing, ...update };

    if (!merged.book) {
      next.perBook.delete(book.id);
    } else {
      next.perBook.set(book.id, {
        book: true,
        bookmarks: merged.bookmarks && book.hasBookmark,
        statistics: merged.statistics && book.hasStatistics
      });
    }

    onchange(next);
  }

  function toggleSelectAllBooks() {
    const next = { ...selection, perBook: new Map(selection.perBook) };
    if (allBooksSelected) {
      next.perBook.clear();
    } else {
      for (const b of catalog.books) {
        if (disabledItems.books?.has(b.id)) continue;
        if (!next.perBook.has(b.id)) {
          next.perBook.set(b.id, { book: true, bookmarks: false, statistics: false });
        }
      }
    }
    onchange(next);
  }

  let selectableBooks = $derived(catalog.books.filter((b) => !disabledItems.books?.has(b.id)));
  let allBooksSelected = $derived(
    selectableBooks.length > 0 && selectableBooks.every((b) => selection.perBook.has(b.id))
  );
  let anyBookSelected = $derived(selection.perBook.size > 0);

  type BulkField = 'bookmarks' | 'statistics';
  type BulkSummary = {
    /** Selected books that *could* carry the field (i.e. catalog says hasBookmark / hasStatistics). */
    available: number;
    /** Of those, how many currently have it selected. */
    chosen: number;
  };

  function summarizeBulk(field: BulkField): BulkSummary {
    let available = 0;
    let chosen = 0;
    for (const [bookId, entry] of selection.perBook) {
      const book = catalog.books.find((b) => b.id === bookId);
      const hasField = book && (field === 'bookmarks' ? book.hasBookmark : book.hasStatistics);
      if (!hasField) continue;
      available += 1;
      if (entry[field]) chosen += 1;
    }
    return { available, chosen };
  }

  function toggleAllOfField(field: BulkField) {
    const summary = summarizeBulk(field);
    // Indeterminate or empty → check all; fully checked → uncheck all.
    const target = summary.chosen < summary.available;
    const next = { ...selection, perBook: new Map(selection.perBook) };
    for (const [bookId, entry] of next.perBook) {
      const book = catalog.books.find((b) => b.id === bookId);
      const hasField = book && (field === 'bookmarks' ? book.hasBookmark : book.hasStatistics);
      if (!hasField) continue;
      next.perBook.set(bookId, { ...entry, [field]: target });
    }
    onchange(next);
  }

  let someBookHasBookmark = $derived(catalog.books.some((b) => b.hasBookmark));
  let someBookHasStatistics = $derived(catalog.books.some((b) => b.hasStatistics));

  let bulkBookmarks = $derived(summarizeBulk('bookmarks'));
  let bulkStatistics = $derived(summarizeBulk('statistics'));
</script>

<div class="space-y-3">
  {#if catalog.hasAppSettings}
    <label class="flex items-start gap-3">
      <input
        type="checkbox"
        class="mt-0.5"
        checked={selection.appSettings}
        disabled={disabledItems.appSettings}
        onchange={(e) =>
          onchange({ ...selection, appSettings: (e.currentTarget as HTMLInputElement).checked })}
      />
      <div>
        <div class="text-sm font-medium" class:text-gray-400={disabledItems.appSettings}>
          App settings
        </div>
        <div class="text-xs text-gray-600">Reader, sync, and statistics preferences.</div>
      </div>
    </label>
  {/if}

  {#if catalog.hasReadingGoals}
    <label class="flex items-start gap-3">
      <input
        type="checkbox"
        class="mt-0.5"
        checked={selection.readingGoals}
        disabled={disabledItems.readingGoals}
        onchange={(e) =>
          onchange({ ...selection, readingGoals: (e.currentTarget as HTMLInputElement).checked })}
      />
      <div>
        <div class="text-sm font-medium" class:text-gray-400={disabledItems.readingGoals}>
          Reading goals
        </div>
        <div class="text-xs text-gray-600">All reading goals and their history.</div>
      </div>
    </label>
  {/if}

  <div class="rounded-md border border-black/10 p-3">
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium">
        Books
        <span class="font-normal text-gray-500"
          >({selection.perBook.size} of {catalog.books.length} selected)</span
        >
      </div>
      {#if catalog.books.length > 0}
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-700">
          <label class="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={allBooksSelected}
              indeterminate={anyBookSelected && !allBooksSelected}
              onchange={toggleSelectAllBooks}
            />
            Select all
          </label>
          {#if someBookHasBookmark}
            <label class="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={bulkBookmarks.available > 0 &&
                  bulkBookmarks.chosen === bulkBookmarks.available}
                indeterminate={bulkBookmarks.chosen > 0 &&
                  bulkBookmarks.chosen < bulkBookmarks.available}
                disabled={bulkBookmarks.available === 0}
                onchange={() => toggleAllOfField('bookmarks')}
              />
              All bookmarks
            </label>
          {/if}
          {#if someBookHasStatistics}
            <label class="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={bulkStatistics.available > 0 &&
                  bulkStatistics.chosen === bulkStatistics.available}
                indeterminate={bulkStatistics.chosen > 0 &&
                  bulkStatistics.chosen < bulkStatistics.available}
                disabled={bulkStatistics.available === 0}
                onchange={() => toggleAllOfField('statistics')}
              />
              All statistics
            </label>
          {/if}
        </div>
      {/if}
    </div>

    {#if catalog.books.length === 0}
      <div class="py-6 text-center text-xs text-gray-500">No books available.</div>
    {:else}
      <ul class="mt-2 max-h-64 divide-y divide-black/5 overflow-y-auto px-1">
        {#each catalog.books as book (book.id)}
          {@const selected = isBookSelected(book)}
          {@const entry = selection.perBook.get(book.id)}
          {@const disabled = disabledItems.books?.has(book.id) ?? false}
          <li class="py-2">
            <label class="flex items-center gap-3">
              <input
                type="checkbox"
                checked={selected}
                {disabled}
                onchange={(e) =>
                  updatePerBookEntry(book, {
                    book: (e.currentTarget as HTMLInputElement).checked
                  })}
              />
              <span
                class="flex-1 truncate text-sm"
                class:text-gray-400={disabled}
                title={book.title}>{book.title}</span
              >
            </label>
            {#if selected && (book.hasBookmark || book.hasStatistics)}
              <div class="mt-1 ml-7 flex flex-wrap gap-3 text-xs text-gray-700">
                {#if book.hasBookmark}
                  <label class="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={entry?.bookmarks ?? false}
                      onchange={(e) =>
                        updatePerBookEntry(book, {
                          bookmarks: (e.currentTarget as HTMLInputElement).checked
                        })}
                    /> Bookmark
                  </label>
                {/if}
                {#if book.hasStatistics}
                  <label class="flex items-center gap-1.5">
                    <input
                      type="checkbox"
                      checked={entry?.statistics ?? false}
                      onchange={(e) =>
                        updatePerBookEntry(book, {
                          statistics: (e.currentTarget as HTMLInputElement).checked
                        })}
                    /> Statistics
                  </label>
                {/if}
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
