<script lang="ts">
  import { resolve } from '$app/paths';
  import type { ResolvedPathname } from '$app/types';
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
  import { getBookStatisticsURL } from '$lib/components/statistics/statistics-view';
  import Popover from '$lib/components/popover/popover.svelte';
  import { displayTitle } from '$lib/functions/book-title';
  import { getBookURL } from '$lib/functions/book-url';
  import { getDateTimeString } from '$lib/functions/statistic-util';
  import Fa from 'svelte-fa';

  interface Props {
    bookCard: BookCardProps;
    ondownload?: (data: { title: string }) => void | Promise<void>;
    oncomplete?: (data: { title: string; completed: boolean }) => void | Promise<void>;
    ondeletestatistics?: (data: { title: string }) => void | Promise<void>;
    onremove?: (data: { title: string }) => void | Promise<void>;
  }

  let { bookCard, ondownload, oncomplete, ondeletestatistics, onremove }: Props = $props();

  let title = $derived(displayTitle(bookCard.title));

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
  action: { href: ResolvedPathname } | { href?: never; onClick?: () => void | Promise<void> },
  fullWidth = false
)}
  {#if action.href !== undefined}
    <!-- Destinations are resolved by the caller before reaching this snippet. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a
      class={`${actionButtonClasses} ${fullWidth ? 'w-full' : ''}`}
      aria-label={ariaLabel}
      href={action.href}
    >
      <Fa {icon} />
      <span>{label}</span>
    </a>
  {:else}
    <button
      type="button"
      class={`${actionButtonClasses} ${fullWidth ? 'w-full' : ''}`}
      aria-label={ariaLabel}
      onclick={() => action.onClick?.()}
    >
      <Fa {icon} />
      <span>{label}</span>
    </button>
  {/if}
{/snippet}

{#snippet menuAction(
  icon: IconDefinition,
  label: string,
  action: { href: ResolvedPathname } | { href?: never; onClick: () => void | Promise<void> },
  danger = false
)}
  {#if action.href !== undefined}
    <!-- Close the popover on activation like the button items; on a plain click the ensuing
      navigation unmounts it anyway, but a modified click stays on this page. -->
    <!-- Destinations are resolved by the caller before reaching this snippet. -->
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
    <a
      class={`${menuButtonClasses} ${danger ? 'text-red-300 hover:text-red-700' : ''}`}
      href={action.href}
      onclick={() => morePopover?.toggleOpen()}
      onauxclick={(event) => {
        if (event.button === 1) morePopover?.toggleOpen();
      }}
    >
      <Fa {icon} />
      <span>{label}</span>
    </a>
  {:else}
    <button
      type="button"
      class={`${menuButtonClasses} ${danger ? 'text-red-300 hover:text-red-700' : ''}`}
      onclick={() => runMenuAction(action.onClick)}
    >
      <Fa {icon} />
      <span>{label}</span>
    </button>
  {/if}
{/snippet}

<div class="mt-2.5 grid grid-cols-[1fr_1fr_auto] gap-1">
  {@render cardAction(faChartLine, 'Stats', `View statistics for ${title}`, {
    href: resolve(getBookStatisticsURL(bookCard.title))
  })}

  {#if bookCard.isPlaceholder}
    {@render cardAction(faDownload, 'Download', `Download ${title}`, {
      onClick: () => ondownload?.({ title: bookCard.title })
    })}
  {:else}
    <Popover
      bind:this={detailsPopover}
      placement="top"
      fallbackPlacements={['right', 'left', 'bottom']}
      yOffset={5}
    >
      {#snippet icon()}
        {@render cardAction(faCircleInfo, 'Details', `Details for ${title}`, {}, true)}
      {/snippet}
      {#snippet content()}
        <div class="w-80 max-w-[calc(100vw-2rem)] p-4 font-normal">
          <div class="wrap-break-word font-medium">{title}</div>
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
        aria-label={`More actions for ${title}`}>•••</button
      >
    {/snippet}
    {#snippet content()}
      <div class="inline-flex min-w-56 flex-col py-2">
        <div class="max-w-72 truncate px-4 pb-2 text-xs font-medium">{title}</div>
        {@render menuAction(faBookOpen, 'Read book', { href: resolve(getBookURL(bookCard.title)) })}
        {@render menuAction(faChartLine, 'View statistics', {
          href: resolve(getBookStatisticsURL(bookCard.title))
        })}
        {@render menuAction(
          faFlag,
          bookCard.completed ? 'Mark as in progress' : 'Mark as complete',
          {
            onClick: () => oncomplete?.({ title: bookCard.title, completed: !bookCard.completed })
          }
        )}
        {#if !bookCard.isPlaceholder}
          {@render menuAction(faCircleInfo, 'Book details', {
            onClick: () => detailsPopover?.toggleOpen()
          })}
        {/if}

        {#if bookCard.isPlaceholder}
          <hr class="mx-4 my-1 border-white/20" />
          {@render menuAction(faDownload, 'Download to this device', {
            onClick: () => ondownload?.({ title: bookCard.title })
          })}
        {/if}

        <hr class="mx-4 my-1 border-white/20" />
        {@render menuAction(faCalendarXmark, 'Delete statistics', {
          onClick: () => ondeletestatistics?.({ title: bookCard.title })
        })}
        {@render menuAction(
          faTrash,
          'Remove from library',
          { onClick: () => onremove?.({ title: bookCard.title }) },
          true
        )}
      </div>
    {/snippet}
  </Popover>
</div>
