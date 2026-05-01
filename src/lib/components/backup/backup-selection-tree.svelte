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
  let appSettingsDisabled = $derived(!catalog.hasAppSettings || !!disabledItems.appSettings);
  let readingGoalsDisabled = $derived(!catalog.hasReadingGoals || !!disabledItems.readingGoals);
</script>

<div class="space-y-3">
  <label class="flex items-start gap-3">
    <input
      type="checkbox"
      class="mt-0.5"
      checked={selection.appSettings}
      disabled={appSettingsDisabled}
      onchange={(e) =>
        onchange({ ...selection, appSettings: (e.currentTarget as HTMLInputElement).checked })}
    />
    <div>
      <div class="text-sm font-medium" class:text-gray-400={appSettingsDisabled}>App settings</div>
      <div class="text-xs text-gray-600">Theme, fonts, tracker configuration, keybindings.</div>
    </div>
  </label>

  <label class="flex items-start gap-3">
    <input
      type="checkbox"
      class="mt-0.5"
      checked={selection.readingGoals}
      disabled={readingGoalsDisabled}
      onchange={(e) =>
        onchange({ ...selection, readingGoals: (e.currentTarget as HTMLInputElement).checked })}
    />
    <div>
      <div class="text-sm font-medium" class:text-gray-400={readingGoalsDisabled}>
        Reading goals
      </div>
      <div class="text-xs text-gray-600">All reading goals and their history.</div>
    </div>
  </label>

  <div class="rounded-md border border-black/10 p-3">
    <div class="flex items-center justify-between">
      <div class="text-sm font-medium">
        Books
        <span class="font-normal text-gray-500"
          >({selection.perBook.size} of {catalog.books.length} selected)</span
        >
      </div>
      {#if catalog.books.length > 0}
        <label class="flex items-center gap-1.5 text-xs text-gray-700">
          <input
            type="checkbox"
            checked={allBooksSelected}
            indeterminate={anyBookSelected && !allBooksSelected}
            onchange={toggleSelectAllBooks}
          />
          Select all
        </label>
      {/if}
    </div>

    {#if catalog.books.length === 0}
      <div class="py-6 text-center text-xs text-gray-500">No books available.</div>
    {:else}
      <ul class="mt-2 max-h-64 divide-y divide-black/5 overflow-y-auto">
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
            {#if selected}
              <div class="mt-1 ml-7 flex flex-wrap gap-3 text-xs text-gray-700">
                <label class="flex items-center gap-1.5">
                  <input type="checkbox" checked disabled /> Book
                </label>
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
