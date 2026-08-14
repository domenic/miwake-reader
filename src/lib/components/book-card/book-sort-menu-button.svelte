<script lang="ts">
  import HeaderMenuButton from '$lib/components/header-menu-button.svelte';
  import { SortDirection, type SortOption } from '$lib/functions/sorting';
  import { booklistSortOptions$ } from '$lib/data/store';
  import {
    faArrowDownShortWide,
    faArrowDownWideShort,
    faSortDown,
    faSortUp
  } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';

  const sortMenuItems: { property: SortOption['property']; label: string }[] = [
    { property: 'addedOrder', label: 'Added' },
    { property: 'title', label: 'Title' },
    { property: 'characters', label: 'Characters' },
    { property: 'lastBookModified', label: 'Last Update' },
    { property: 'lastBookOpen', label: 'Last Read' },
    { property: 'progress', label: 'Progress' },
    { property: 'lastBookmarkModified', label: 'Bookmarked' }
  ];

  function setSort(property: SortOption['property'], direction: SortDirection, close: () => void) {
    booklistSortOptions$.set({ property, direction });
    close();
  }
</script>

<HeaderMenuButton
  title="Select sort options"
  label="Sort"
  fill
  faIcon={$booklistSortOptions$.direction === SortDirection.ASC
    ? faArrowDownShortWide
    : faArrowDownWideShort}
  items={sortMenuItems}
>
  {#snippet item(sortMenuItem, close)}
    {@const isCurrentSort = $booklistSortOptions$.property === sortMenuItem.property}
    {@const isCurrentSortAsc =
      isCurrentSort && $booklistSortOptions$.direction === SortDirection.ASC}
    <div
      class="grid cursor-default grid-cols-[auto_auto_auto] text-sm hover:bg-white hover:text-gray-700"
      class:bg-white={isCurrentSort}
      class:text-gray-700={isCurrentSort}
      class:hover:opacity-70={isCurrentSort}
    >
      <button
        type="button"
        aria-label={`Sort by ${sortMenuItem.label} ascending`}
        class="self-center justify-self-start"
        class:text-red-500={isCurrentSortAsc}
        class:hover:text-gray-700={isCurrentSortAsc}
        class:hover:text-red-500={!isCurrentSortAsc}
        onclick={() => setSort(sortMenuItem.property, SortDirection.ASC, close)}
      >
        <Fa icon={faSortUp} class="px-4" />
      </button>
      <div class="py-2">
        {sortMenuItem.label}
      </div>
      <button
        type="button"
        aria-label={`Sort by ${sortMenuItem.label} descending`}
        class="justify-self-end hover:text-red-500"
        class:text-red-500={isCurrentSort && !isCurrentSortAsc}
        class:hover:text-gray-700={isCurrentSort && !isCurrentSortAsc}
        class:hover:text-red-500={!isCurrentSort || isCurrentSortAsc}
        onclick={() => setSort(sortMenuItem.property, SortDirection.DESC, close)}
      >
        <Fa icon={faSortDown} class="mt-1 px-4" />
      </button>
    </div>
  {/snippet}
</HeaderMenuButton>
