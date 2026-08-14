<script lang="ts">
  import { resolve } from '$app/paths';
  import BookCardActions from '$lib/components/book-card/book-card-actions.svelte';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import BookCard from '$lib/components/book-card/book-card.svelte';
  import { syncState } from '$lib/data/sync/sync-store.svelte';
  import { displayTitle } from '$lib/functions/book-title';
  import { getBookURL } from '$lib/functions/book-url';

  interface Props {
    bookCards?: BookCardProps[];
    currentBookTitle?: string | undefined;
    selectedBookTitles: ReadonlySet<string>;
    selectMode?: boolean;
    onbookSelect?: (data: { title: string }) => void;
    ondownloadBookClick?: (data: { title: string }) => void | Promise<void>;
    oncompleteBookClick?: (data: { title: string; completed: boolean }) => void | Promise<void>;
    ondeleteStatisticsClick?: (data: { title: string }) => void | Promise<void>;
    onremoveBookClick?: (data: { title: string }) => void | Promise<void>;
  }

  let {
    bookCards = [],
    currentBookTitle,
    selectedBookTitles,
    selectMode = false,
    onbookSelect,
    ondownloadBookClick,
    oncompleteBookClick,
    ondeleteStatisticsClick,
    onremoveBookClick
  }: Props = $props();

  let placeholderTooltip = $derived(
    syncState.location?.kind === 'fs'
      ? 'Not downloaded yet — open or download the book to copy it from your local sync folder'
      : 'Not downloaded yet — open or download the book to fetch it from its sync location'
  );

  const hitTargetClasses = 'absolute inset-0 z-1 rounded-sm';
</script>

<div class="grid grid-cols-2 gap-x-5 gap-y-9 pb-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
  {#each bookCards as bookCard (bookCard.title)}
    {@const isSelected = selectMode && selectedBookTitles.has(bookCard.title)}
    {@const displayedTitle = displayTitle(bookCard.title)}
    <article class="relative min-w-0">
      <div class="group relative min-w-0 rounded-sm">
        <BookCard
          {...bookCard}
          current={bookCard.title === currentBookTitle}
          selected={isSelected}
        />

        {#if selectMode}
          <button
            type="button"
            class={hitTargetClasses}
            class:outline-2={isSelected}
            class:outline-offset-4={isSelected}
            class:outline-blue-400={isSelected}
            title={bookCard.isPlaceholder ? placeholderTooltip : undefined}
            aria-label={displayedTitle}
            aria-pressed={isSelected}
            onclick={() => onbookSelect?.({ title: bookCard.title })}
          ></button>
        {:else}
          <a
            class={hitTargetClasses}
            title={bookCard.isPlaceholder ? placeholderTooltip : undefined}
            aria-label={displayedTitle}
            href={resolve(getBookURL(bookCard.title))}
          ></a>
        {/if}
      </div>

      <BookCardActions
        {bookCard}
        ondownload={ondownloadBookClick}
        oncomplete={oncompleteBookClick}
        ondeletestatistics={ondeleteStatisticsClick}
        onremove={onremoveBookClick}
      />
    </article>
  {/each}
</div>
