<script lang="ts">
  import {
    faBookOpen,
    faCalendarXmark,
    faChartLine,
    faCircleInfo,
    faDownload,
    faFlag,
    faTrash
  } from '@fortawesome/free-solid-svg-icons';
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import Popover from '$lib/components/popover/popover.svelte';
  import { getDateTimeString } from '$lib/functions/statistic-util';
  import Fa from 'svelte-fa';

  interface Props {
    bookCard: BookCardProps;
    onread?: (data: { id: number }) => void | Promise<void>;
    onstatistics?: (data: { id: number }) => void | Promise<void>;
    ondownload?: (data: { id: number }) => void | Promise<void>;
    oncomplete?: (data: { id: number; completed: boolean }) => void | Promise<void>;
    ondeletestatistics?: (data: { id: number }) => void | Promise<void>;
    onremove?: (data: { id: number }) => void | Promise<void>;
  }

  let {
    bookCard,
    onread,
    onstatistics,
    ondownload,
    oncomplete,
    ondeletestatistics,
    onremove
  }: Props = $props();

  let detailsPopover = $state<Popover>();
  let morePopover = $state<Popover>();

  const actionButtonClasses =
    'flex h-8 min-w-0 items-center justify-center gap-1.5 rounded-sm border border-gray-400/40 px-2 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-400/10 hover:text-gray-900';
  const menuButtonClasses =
    'flex w-full items-center gap-3 px-4 py-2 text-left text-sm font-normal whitespace-nowrap hover:bg-white hover:text-gray-700';

  function getCardDateInfo(dateTime: number) {
    return dateTime ? getDateTimeString(dateTime, { includeSeconds: false }) : 'No Data';
  }

  let detailRows = $derived([
    {
      label: 'Characters',
      value: bookCard.characters ? bookCard.characters.toLocaleString() : 'No Data'
    },
    { label: 'Last read', value: getCardDateInfo(bookCard.lastBookOpen) },
    { label: 'Bookmarked', value: getCardDateInfo(bookCard.lastBookmarkModified) },
    { label: 'Last update', value: getCardDateInfo(bookCard.lastBookModified) }
  ]);

  async function runMenuAction(action?: () => void | Promise<void>) {
    await morePopover?.toggleOpen();
    await action?.();
  }
</script>

{#snippet cardAction(
  icon: IconDefinition,
  label: string,
  ariaLabel: string,
  action?: () => void | Promise<void>,
  fullWidth = false
)}
  <button
    type="button"
    class={`${actionButtonClasses} ${fullWidth ? 'w-full' : ''}`}
    aria-label={ariaLabel}
    onclick={() => action?.()}
  >
    <Fa {icon} />
    <span>{label}</span>
  </button>
{/snippet}

{#snippet menuAction(
  icon: IconDefinition,
  label: string,
  action: () => void | Promise<void>,
  danger = false
)}
  <button
    type="button"
    class={`${menuButtonClasses} ${danger ? 'text-red-300 hover:text-red-700' : ''}`}
    onclick={() => runMenuAction(action)}
  >
    <Fa {icon} />
    <span>{label}</span>
  </button>
{/snippet}

<div class="mt-2.5 grid grid-cols-[1fr_1fr_auto] gap-1">
  {@render cardAction(faChartLine, 'Stats', `View statistics for ${bookCard.title}`, () =>
    onstatistics?.({ id: bookCard.id })
  )}

  {#if bookCard.isPlaceholder}
    {@render cardAction(faDownload, 'Download', `Download ${bookCard.title}`, () =>
      ondownload?.({ id: bookCard.id })
    )}
  {:else}
    <Popover
      bind:this={detailsPopover}
      placement="top"
      fallbackPlacements={['right', 'left', 'bottom']}
      yOffset={5}
    >
      {#snippet icon()}
        {@render cardAction(
          faCircleInfo,
          'Details',
          `Details for ${bookCard.title}`,
          undefined,
          true
        )}
      {/snippet}
      {#snippet content()}
        <div class="w-80 max-w-[calc(100vw-2rem)] p-4 font-normal">
          <div class="wrap-break-word font-medium">{bookCard.title}</div>
          <dl class="mt-3 grid gap-2 text-xs">
            {#each detailRows as row (row.label)}
              <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
                <dt class="text-gray-300">{row.label}</dt>
                <dd class="text-right whitespace-nowrap">{row.value}</dd>
              </div>
            {/each}
          </dl>
        </div>
      {/snippet}
    </Popover>
  {/if}

  <Popover
    bind:this={morePopover}
    placement="bottom-end"
    fallbackPlacements={['bottom', 'left', 'top-end']}
    yOffset={5}
  >
    {#snippet icon()}
      <button
        type="button"
        class={`${actionButtonClasses} min-w-8 px-1.5 tracking-wider`}
        aria-label={`More actions for ${bookCard.title}`}>•••</button
      >
    {/snippet}
    {#snippet content()}
      <div class="inline-flex min-w-56 flex-col py-2">
        <div class="max-w-72 truncate px-4 pb-2 text-xs font-medium">{bookCard.title}</div>
        {@render menuAction(faBookOpen, 'Read book', () => onread?.({ id: bookCard.id }))}
        {@render menuAction(faChartLine, 'View statistics', () =>
          onstatistics?.({ id: bookCard.id })
        )}
        {@render menuAction(
          faFlag,
          bookCard.completed ? 'Mark as in progress' : 'Mark as complete',
          () => oncomplete?.({ id: bookCard.id, completed: !bookCard.completed })
        )}
        {#if !bookCard.isPlaceholder}
          {@render menuAction(faCircleInfo, 'Book details', () => detailsPopover?.toggleOpen())}
        {/if}

        {#if bookCard.isPlaceholder}
          <hr class="mx-4 my-1 border-white/20" />
          {@render menuAction(faDownload, 'Download to this device', () =>
            ondownload?.({ id: bookCard.id })
          )}
        {/if}

        <hr class="mx-4 my-1 border-white/20" />
        {@render menuAction(faCalendarXmark, 'Delete statistics', () =>
          ondeletestatistics?.({ id: bookCard.id })
        )}
        {@render menuAction(
          faTrash,
          'Remove from library',
          () => onremove?.({ id: bookCard.id }),
          true
        )}
      </div>
    {/snippet}
  </Popover>
</div>
