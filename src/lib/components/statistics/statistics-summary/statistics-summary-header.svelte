<script lang="ts">
  import { faArrowDownWideShort, faArrowUpShortWide } from '@fortawesome/free-solid-svg-icons';
  import type {
    StatisticsDataSourceChange,
    StatisticsSummaryKey
  } from '$lib/components/statistics/statistics-summary/statistics-summary';
  import type {
    BookStatistic,
    StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import { SortDirection } from '$lib/functions/sorting';
  import {
    lastStatisticsSummarySortDirection$,
    lastStatisticsSummarySortProperty$
  } from '$lib/data/store';
  import Fa from 'svelte-fa';

  interface Props {
    statisticsSummaryKey: StatisticsSummaryKey;
    options: StatisticsDataSource[];
    selectionKey: keyof BookStatistic;
    hasRowInEdit: boolean;
    isHidden?: boolean;
    title?: string;
    onpropertyChange?: (data: StatisticsDataSourceChange) => void;
  }

  let {
    statisticsSummaryKey,
    options,
    selectionKey,
    hasRowInEdit,
    isHidden = false,
    title = '',
    onpropertyChange
  }: Props = $props();

  const tableHeaderClasses =
    'flex h-full w-full items-center px-0 py-2.5 text-sm appearance-none border-0 bg-transparent focus:outline-hidden focus:ring-0 peer lg:text-base';

  const componentId = $props.id();
  const popoverId = `${componentId}-options`;

  let optionKeys = $derived(
    new Set<keyof BookStatistic>((options || []).map((option) => option.key))
  );

  let selectedOption = $derived(options.find((option) => option.key === selectionKey)!);
</script>

<div class={tableHeaderClasses} class:hidden={isHidden}>
  {#if options.length > 1 && !hasRowInEdit}
    <button class="flex flex-1 text-left" {title} popovertarget={popoverId}>
      {selectedOption.label}
    </button>
    <div
      popover
      data-testid="statistics-summary-options"
      id={popoverId}
      class="summary-header-popover m-0 max-h-[calc(100vh-2rem)] w-46 max-w-[calc(100vw-2rem)] flex-col overflow-auto border-0 bg-gray-700 p-0 text-sm font-bold text-white shadow-lg"
    >
      {#each options as option (option.key)}
        <button
          class={[
            'w-full px-4 py-2 text-left text-sm whitespace-nowrap text-white',
            option.key === selectionKey ? 'bg-white/15 hover:bg-white/20' : 'hover:bg-white/10'
          ]}
          popovertarget={popoverId}
          popovertargetaction="hide"
          onclick={() => {
            onpropertyChange?.({ property: option.key, statisticsSummaryKey });
          }}
        >
          {option.label}
        </button>
      {/each}
    </div>
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
    title="Click to select/sort by this attribute"
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

<style>
  .summary-header-popover {
    position-area: bottom span-right;
    margin-block-start: 4px;
    position-try-fallbacks:
      flip-inline,
      flip-block,
      flip-block flip-inline;

    &:popover-open {
      display: flex;
    }
  }
</style>
