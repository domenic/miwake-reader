<script lang="ts">
  import { faArrowDownWideShort, faArrowUpShortWide } from '@fortawesome/free-solid-svg-icons';
  import Popover from '$lib/components/popover/popover.svelte';
  import type {
    StatisticsDataSourceChange,
    StatisticsSummaryKey
  } from '$lib/components/statistics/statistics-summary/statistics-summary';
  import type {
    BookStatistic,
    StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import { SortDirection } from '$lib/data/sort-types';
  import {
    lastStatisticsSummarySortDirection$,
    lastStatisticsSummarySortProperty$
  } from '$lib/data/store';
  import Fa from 'svelte-fa';

  interface Props {
    statisticsSummaryKey: StatisticsSummaryKey;
    options: StatisticsDataSource[];
    selectionKey: keyof BookStatistic;
    gridRow?: number;
    hasRowInEdit: boolean;
    isHidden?: boolean;
    title?: string;
    onpropertyChange?: (data: StatisticsDataSourceChange) => void;
  }

  let {
    statisticsSummaryKey,
    options,
    selectionKey,
    gridRow,
    hasRowInEdit,
    isHidden = false,
    title = '',
    onpropertyChange
  }: Props = $props();

  const tableHeaderClasses =
    'flex items-center py-2.5 px-0 text-sm w-full bg-transparent border-0 md:border-b-2 border-gray-200 appearance-none focus:outline-none focus:ring-0 focus:border-gray-200 peer lg:text-base';

  let summaryHeaderPopover = $state<Popover>();

  let optionKeys = $derived(
    new Set<keyof BookStatistic>((options || []).map((option) => option.key))
  );

  let selectedOption = $derived(options.find((option) => option.key === selectionKey)!);
</script>

<div
  tabindex="0"
  role="button"
  class={tableHeaderClasses}
  class:hidden={isHidden}
  style:grid-row={gridRow ? `${gridRow}/${gridRow}` : null}
>
  {#if options.length > 1 && !hasRowInEdit}
    <Popover
      placement={'bottom-start'}
      fallbackPlacements={['top']}
      innerContainerStyles={'width: 100%'}
      containerStyles={'flex: 1;'}
      bind:this={summaryHeaderPopover}
    >
      <div {title}>{selectedOption.label}</div>
      {#snippet content()}
        <div class="flex flex-col overflow-auto w-46 p-2">
          {#each options as option (option.key)}
            <button
              class="flex flex-1 my-2 hover:opacity-50 hover:bg-slate-300 hover:text-black"
              onclick={(e) => {
                e.stopPropagation();
                onpropertyChange?.({ property: option.key, statisticsSummaryKey });
                summaryHeaderPopover?.toggleOpen();
              }}
            >
              {option.label}
            </button>
          {/each}
        </div>
      {/snippet}
    </Popover>
  {:else}
    <button
      class="flex flex-1 text-left"
      class:cursor-not-allowed={hasRowInEdit}
      disabled={hasRowInEdit}
      {title}
      onclick={() => {
        onpropertyChange?.({ property: selectedOption.key, statisticsSummaryKey });
      }}
    >
      {selectedOption.label}
    </button>
  {/if}
  <button
    title="Click to select/sort by this Attribute"
    class="ml-4"
    class:opacity-20={!optionKeys.has($lastStatisticsSummarySortProperty$)}
    class:cursor-not-allowed={hasRowInEdit}
    disabled={hasRowInEdit}
    onclick={() => onpropertyChange?.({ property: selectedOption.key, statisticsSummaryKey })}
  >
    {#if $lastStatisticsSummarySortDirection$ === SortDirection.ASC}
      <Fa icon={faArrowUpShortWide} />
    {:else}
      <Fa icon={faArrowDownWideShort} />
    {/if}
  </button>
</div>
