<script lang="ts">
  import {
    faCalendar,
    faCalendarXmark,
    faChevronLeft,
    faChevronRight,
    faCircleCheck,
    faEye,
    faEyeSlash,
    faList,
    faListCheck,
    faTrash,
    faXmark
  } from '@fortawesome/free-solid-svg-icons';
  import {
    preFilteredTitlesForStatistics$,
    type StatisticsTitleFilterItem
  } from '$lib/components/statistics/statistics-types';
  import { dialogManager } from '$lib/data/dialog-manager';
  import {
    lastStatisticsFilterDateRangeOnly$,
    lastStatisticsFilterShowSelectedTitlesOnly$,
    skipKeyDownListener$
  } from '$lib/data/store';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';
  import { convertRemToPixels, getFullHeight, limitToRange } from '$lib/functions/utils';
  import { debounceTime, fromEvent, tap } from 'rxjs';
  import { onMount, tick } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    statisticsTitleFilters: Map<string, boolean>;
    titlesInStatisticsDateRange: Set<string>;
    onclose?: () => void;
    onapplyFilter?: (data: StatisticsTitleFilterItem[]) => void;
    onclearPrefilter?: () => void;
  }

  let {
    statisticsTitleFilters,
    titlesInStatisticsDateRange,
    onclose,
    onapplyFilter,
    onclearPrefilter
  }: Props = $props();

  const resizeHandler$ = fromEvent(window, 'resize').pipe(
    debounceTime(250),
    tap(() => updateStatisticsTitleFilterRowsPerPage),
    reduceToEmptyString()
  );

  const statisticsTitleFilterBaseRowRem = 4;
  const statisticsTitleFilterBaseRowGap = 2;

  let statisticsTitleFilterTableContainerElm = $state<HTMLElement>();
  let statisticsTitleFilterButtonContainer = $state<HTMLElement>();
  let titleFilter = $state('');
  let titleFilterTimer: number | undefined;
  let titlesToFilter: StatisticsTitleFilterItem[] = $state([]);
  let filteredTitles: StatisticsTitleFilterItem[] = $state([]);
  let currentTitlesToFilterRows: StatisticsTitleFilterItem[] = $state([]);
  let statisticsTitleFilterMaxPages = $state(0);
  let currentStatisticsTitleFilterPage = $state(1);
  let statisticsTitleFilterRowsPerPage = $state(0);

  let statisticsTitleFilterPageLabel = $derived(
    `PAGE ${currentStatisticsTitleFilterPage} / ${statisticsTitleFilterMaxPages}`
  );

  $effect(() => {
    setTitlesToFilter(statisticsTitleFilters);
  });

  $effect(() => {
    applyTitleFilters(
      $lastStatisticsFilterDateRangeOnly$,
      $lastStatisticsFilterShowSelectedTitlesOnly$
    );
  });

  $effect(() => {
    updateStatisticsTitleFilterTableData(currentStatisticsTitleFilterPage);
  });

  onMount(() => {
    $skipKeyDownListener$ = true;
    dialogManager.dialogs$.next([{ component: '<div/>' }]);

    updateStatisticsTitleFilterRowsPerPage();

    return () => {
      dialogManager.dialogs$.next([]);
      $skipKeyDownListener$ = false;
    };
  });

  function handleTitleFilterChange() {
    clearTimeout(titleFilterTimer);
    titleFilterTimer = window.setTimeout(() => {
      applyTitleFilters();
    }, 500);
  }

  function handleSelectAll(valueToSet: boolean) {
    for (let index = 0, { length } = titlesToFilter; index < length; index += 1) {
      titlesToFilter[index].isSelected = valueToSet;
    }

    if ($lastStatisticsFilterShowSelectedTitlesOnly$) {
      applyTitleFilters();
    } else {
      updateStatisticsTitleFilterTableData(currentStatisticsTitleFilterPage);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function setTitlesToFilter(_: any) {
    const entries = [...statisticsTitleFilters.entries()];

    titlesToFilter = entries.map(([title, isSelected]) => ({ title, isSelected }));

    applyTitleFilters();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function applyTitleFilters(..._: any) {
    tick().then(() => {
      filteredTitles = titlesToFilter.filter(
        (filterItem) =>
          (!titleFilter || filterItem.title.includes(titleFilter)) &&
          (!$lastStatisticsFilterDateRangeOnly$ ||
            titlesInStatisticsDateRange.has(filterItem.title)) &&
          (!$lastStatisticsFilterShowSelectedTitlesOnly$ || filterItem.isSelected)
      );

      updateStatisticsTitleFilterRowsPerPage(currentStatisticsTitleFilterPage);
    });
  }

  function updateStatisticsTitleFilterRowsPerPage(newPage?: number) {
    tick().then(() => {
      const tableContainer = statisticsTitleFilterTableContainerElm;
      const buttonContainer = statisticsTitleFilterButtonContainer;

      if (!tableContainer || !buttonContainer) {
        return;
      }

      statisticsTitleFilterRowsPerPage = Math.max(
        1,
        Math.ceil(
          (getFullHeight(window, tableContainer) - getFullHeight(window, buttonContainer, true)) /
            convertRemToPixels(
              window,
              statisticsTitleFilterBaseRowRem + statisticsTitleFilterBaseRowGap + 0.4
            )
        )
      );

      updateStatisticsTitleFilterPageData(newPage);
    });
  }

  function updateStatisticsTitleFilterPageData(newPage?: number) {
    statisticsTitleFilterMaxPages = Math.ceil(
      filteredTitles.length / statisticsTitleFilterRowsPerPage
    );

    currentStatisticsTitleFilterPage = newPage
      ? limitToRange(1, statisticsTitleFilterMaxPages, newPage)
      : limitToRange(1, statisticsTitleFilterMaxPages, currentStatisticsTitleFilterPage);

    updateStatisticsTitleFilterTableData(currentStatisticsTitleFilterPage);
  }

  function updateStatisticsTitleFilterTableData(pageNumber: number) {
    if (!pageNumber) {
      return;
    }

    const currenPageStart = (pageNumber - 1) * statisticsTitleFilterRowsPerPage;

    currentTitlesToFilterRows = filteredTitles.slice(
      currenPageStart,
      currenPageStart + statisticsTitleFilterRowsPerPage
    );
  }
</script>

{$resizeHandler$ ?? ''}
<div class="flex items-center p-4">
  <button
    title="Close title filter"
    class="flex items-end md:items-center"
    onclick={() => onclose?.()}
  >
    <Fa icon={faXmark} />
  </button>
</div>
<div class="flex flex-col flex-1 px-4">
  <input
    type="search"
    placeholder="Filter Title"
    class="w-full text-black"
    bind:value={titleFilter}
    oninput={handleTitleFilterChange}
  />
  <div class="flex justify-between mt-6 text-2xl">
    <button
      title="Apply filter"
      class="hover:text-red-500"
      onclick={() => {
        onapplyFilter?.(titlesToFilter);
        onclose?.();
      }}
    >
      <Fa icon={faCircleCheck} />
    </button>
    <button title="Select all" class="hover:text-red-500" onclick={() => handleSelectAll(true)}>
      <Fa icon={faListCheck} />
    </button>
    <button title="Remove all" class="hover:text-red-500" onclick={() => handleSelectAll(false)}>
      <Fa icon={faList} />
    </button>
    <button
      title={$lastStatisticsFilterDateRangeOnly$
        ? 'Display Titles across all Time'
        : 'Display Titles in selected Date Range only'}
      class="hover:text-red-500"
      onclick={() => ($lastStatisticsFilterDateRangeOnly$ = !$lastStatisticsFilterDateRangeOnly$)}
    >
      <Fa icon={$lastStatisticsFilterDateRangeOnly$ ? faCalendarXmark : faCalendar} />
    </button>
    <button
      title={$lastStatisticsFilterShowSelectedTitlesOnly$
        ? 'Display all Titles'
        : 'Display selected Titles only'}
      class="hover:text-red-500"
      onclick={() =>
        ($lastStatisticsFilterShowSelectedTitlesOnly$ =
          !$lastStatisticsFilterShowSelectedTitlesOnly$)}
    >
      <Fa icon={$lastStatisticsFilterShowSelectedTitlesOnly$ ? faEyeSlash : faEye} />
    </button>
    {#if $preFilteredTitlesForStatistics$.size}
      <button
        title="Remove prefilter"
        class="hover:text-red-500"
        onclick={() => onclearPrefilter?.()}
      >
        <Fa icon={faTrash} />
      </button>
    {/if}
  </div>
  <div class="grow mt-8 pl-1 overflow-auto" bind:this={statisticsTitleFilterTableContainerElm}>
    {#if filteredTitles.length}
      <div
        class="grid grid-cols-[max-content_auto] gap-x-8 items-center"
        style:grid-auto-rows={`${statisticsTitleFilterBaseRowRem}rem`}
        style:row-gap={`${statisticsTitleFilterBaseRowGap}rem`}
      >
        {#each currentTitlesToFilterRows as currentTitlesToFilterRow, rowIndex (currentTitlesToFilterRow.title)}
          {@const checkboxId = `statistics-title-filter-${currentStatisticsTitleFilterPage}-${rowIndex}`}
          <input
            id={checkboxId}
            type="checkbox"
            bind:checked={currentTitlesToFilterRow.isSelected}
            onchange={() => {
              if ($lastStatisticsFilterShowSelectedTitlesOnly$) {
                applyTitleFilters();
              }
            }}
          />
          <label
            for={checkboxId}
            class="line-clamp-3"
            class:opacity-50={!titlesInStatisticsDateRange.has(currentTitlesToFilterRow.title)}
            title={currentTitlesToFilterRow.title}
          >
            {currentTitlesToFilterRow.title}
          </label>
        {/each}
      </div>
    {:else}
      <div class="mt-6 text-2xl text-center">No Titles to filter</div>
    {/if}
  </div>
  <div
    class="my-6 flex justify-between"
    class:invisible={statisticsTitleFilterMaxPages < 2}
    bind:this={statisticsTitleFilterButtonContainer}
  >
    <button
      disabled={currentStatisticsTitleFilterPage === 1}
      class:opacity-25={currentStatisticsTitleFilterPage === 1}
      class:cursor-not-allowed={currentStatisticsTitleFilterPage === 1}
      onclick={() => (currentStatisticsTitleFilterPage -= 1)}
    >
      <Fa icon={faChevronLeft} />
    </button>
    <div class="mx-6">{statisticsTitleFilterPageLabel}</div>
    <button
      disabled={currentStatisticsTitleFilterPage === statisticsTitleFilterMaxPages}
      class:opacity-25={currentStatisticsTitleFilterPage === statisticsTitleFilterMaxPages}
      class:cursor-not-allowed={currentStatisticsTitleFilterPage === statisticsTitleFilterMaxPages}
      onclick={() => (currentStatisticsTitleFilterPage += 1)}
    >
      <Fa icon={faChevronRight} />
    </button>
  </div>
</div>
