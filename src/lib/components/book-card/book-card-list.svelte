<script lang="ts">
  import BookCardActions from '$lib/components/book-card/book-card-actions.svelte';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import BookCard from '$lib/components/book-card/book-card.svelte';
  import { syncState } from '$lib/data/sync/sync-store.svelte';

  interface Props {
    bookCards?: BookCardProps[];
    currentBookId?: number | undefined;
    selectedBookIds: ReadonlySet<number>;
    selectMode?: boolean;
    onbookClick?: (data: { id: number }) => void | Promise<void>;
    onreadBookClick?: (data: { id: number }) => void | Promise<void>;
    onstatisticsClick?: (data: { id: number }) => void | Promise<void>;
    ondownloadBookClick?: (data: { id: number }) => void | Promise<void>;
    oncompleteBookClick?: (data: { id: number; completed: boolean }) => void | Promise<void>;
    ondeleteStatisticsClick?: (data: { id: number }) => void | Promise<void>;
    onremoveBookClick?: (data: { id: number }) => void | Promise<void>;
  }

  let {
    bookCards = [],
    currentBookId,
    selectedBookIds,
    selectMode = false,
    onbookClick,
    onreadBookClick,
    onstatisticsClick,
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
</script>

<div class="grid grid-cols-2 gap-x-5 gap-y-9 pb-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
  {#each bookCards as bookCard (bookCard.id)}
    <article class="relative min-w-0">
      <BookCard
        {...bookCard}
        current={bookCard.id === currentBookId}
        selected={selectedBookIds.has(bookCard.id)}
        selectionMode={selectMode}
        tooltip={bookCard.isPlaceholder ? placeholderTooltip : undefined}
        onclick={() => onbookClick?.({ id: bookCard.id })}
      />

      <BookCardActions
        {bookCard}
        onread={onreadBookClick}
        onstatistics={onstatisticsClick}
        ondownload={ondownloadBookClick}
        oncomplete={oncompleteBookClick}
        ondeletestatistics={ondeleteStatisticsClick}
        onremove={onremoveBookClick}
      />
    </article>
  {/each}
</div>
