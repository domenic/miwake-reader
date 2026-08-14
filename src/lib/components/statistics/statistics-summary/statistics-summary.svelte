<script lang="ts">
  import {
    faClose,
    faFloppyDisk,
    faPen,
    faTrash,
    faXmark
  } from '@fortawesome/free-solid-svg-icons';
  import Popover from '$lib/components/popover/popover.svelte';
  import {
    StatisticsSummaryKey,
    type StatisticsDataSourceChange,
    type StatisticsDeleteRequest,
    type StatisticsEditRequest
  } from '$lib/components/statistics/statistics-summary/statistics-summary';
  import StatisticsSummaryHeader from '$lib/components/statistics/statistics-summary/statistics-summary-header.svelte';
  import {
    type BookStatistic,
    StatisticsReadingDataAggregationMode,
    readingTimeDataSources,
    charactersDataSources,
    readingSpeedDataSources,
    dateDataSources,
    titleDataSources
  } from '$lib/components/statistics/statistics-types';
  import { SortDirection } from '$lib/data/sort-types';
  import { compareBookTitles, displayTitle } from '$lib/functions/book-title';
  import { japaneseLangIfNeeded } from '$lib/functions/japanese-language';
  import {
    lastBlurredTrackerItems$,
    lastCharactersDataSource$,
    lastPrimaryReadingDataAggregationMode$,
    lastReadingSpeedDataSource$,
    lastReadingTimeDataSource$,
    lastStatisticsEndDate$,
    lastStatisticsStartDate$,
    lastStatisticsSummarySortDirection$,
    lastStatisticsSummarySortProperty$
  } from '$lib/data/store';
  import { getNumberFromObject, secondsToMinutes } from '$lib/functions/statistic-util';
  import { tick, untrack } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    aggregatedStatistics: BookStatistic[];
    statisticsDateRangeLabel: string;
    ondelete?: (request: StatisticsDeleteRequest) => void;
    onedit?: (request: StatisticsEditRequest) => void;
  }

  let { aggregatedStatistics, statisticsDateRangeLabel, ondelete, onedit }: Props = $props();

  const statisticsSummaryBaseRowRem = 3;
  const statisticsSummaryBaseRowGap = 1.5;

  let statisticsSummaryPopover = $state<Popover>();
  let statisticsSummaryPopoverDetails: string[] = $state([]);
  let rowInEdit = $state<BookStatistic>();
  let rowInEditTime = $state(0);
  let rowInEditCharacters = $state(0);
  let rowInEditResetMinMaxValues = $state(false);

  // Derive sorted data from the raw statistics + sort settings
  let sortedData = $derived.by(() => {
    const data = [...aggregatedStatistics];
    data.sort(sortTable);
    return data;
  });

  // When new data arrives, reset edit mode.
  $effect(() => {
    if (aggregatedStatistics) {
      untrack(() => {
        setRowInEditMode();
      });
    }
  });

  // When aggregation mode changes, update grid layout and fix sort property
  $effect(() => {
    const mode = $lastPrimaryReadingDataAggregationMode$;
    untrack(() => {
      setRowInEditMode();

      switch (mode) {
        case StatisticsReadingDataAggregationMode.DATE:
          if ($lastStatisticsSummarySortProperty$ === 'title') {
            $lastStatisticsSummarySortProperty$ = 'readingTime';
          }
          break;
        case StatisticsReadingDataAggregationMode.TITLE:
          if ($lastStatisticsSummarySortProperty$ === 'dateKey') {
            $lastStatisticsSummarySortProperty$ = 'readingTime';
          }
          break;
        default:
          $lastReadingTimeDataSource$ = 'readingTime';
          break;
      }
    });
  });

  // When a data source changes, sync the sort property to match
  $effect(() => {
    const readingTime = $lastReadingTimeDataSource$;
    const characters = $lastCharactersDataSource$;
    const readingSpeed = $lastReadingSpeedDataSource$;

    untrack(() => {
      const currentSort = $lastStatisticsSummarySortProperty$;
      let valueToSet: keyof BookStatistic | undefined;

      switch (currentSort) {
        case 'readingTime':
        case 'averageReadingTime':
        case 'averageWeightedReadingTime':
          if (currentSort !== readingTime) valueToSet = readingTime;
          break;
        case 'charactersRead':
        case 'averageCharactersRead':
        case 'averageWeightedCharactersRead':
          if (currentSort !== characters) valueToSet = characters;
          break;
        case 'lastReadingSpeed':
        case 'minReadingSpeed':
        case 'altMinReadingSpeed':
        case 'maxReadingSpeed':
          if (currentSort !== readingSpeed) valueToSet = readingSpeed;
          break;
        default:
          break;
      }

      if (valueToSet) {
        $lastStatisticsSummarySortProperty$ = valueToSet;
      }
    });
  });

  function dispatchDeleteRequest(row: BookStatistic) {
    const request: StatisticsDeleteRequest = {
      startDate: '',
      endDate: '',
      titlesToCheck: new Set<string>()
    };

    if ($lastPrimaryReadingDataAggregationMode$ === StatisticsReadingDataAggregationMode.NONE) {
      request.startDate = row.dateKey;
      request.endDate = row.dateKey;
      request.titlesToCheck.add(row.title);
    } else if (
      $lastPrimaryReadingDataAggregationMode$ === StatisticsReadingDataAggregationMode.DATE
    ) {
      request.startDate = row.dateKey;
      request.endDate = row.dateKey;
    } else {
      request.startDate = $lastStatisticsStartDate$;
      request.endDate = $lastStatisticsEndDate$;
      request.titlesToCheck.add(row.title);
    }

    ondelete?.(request);
  }

  function handlePropertyChange({ property, statisticsSummaryKey }: StatisticsDataSourceChange) {
    switch (statisticsSummaryKey) {
      case StatisticsSummaryKey.READING_TIME:
        $lastReadingTimeDataSource$ = property;
        break;
      case StatisticsSummaryKey.CHARACTERS:
        $lastCharactersDataSource$ = property;
        break;
      case StatisticsSummaryKey.READING_SPEED:
        $lastReadingSpeedDataSource$ = property;
        break;

      default:
        break;
    }

    const wasSameProperty = property === $lastStatisticsSummarySortProperty$;

    if (wasSameProperty) {
      $lastStatisticsSummarySortDirection$ =
        $lastStatisticsSummarySortDirection$ === SortDirection.ASC
          ? SortDirection.DESC
          : SortDirection.ASC;
    }

    $lastStatisticsSummarySortProperty$ = property;
  }

  function sortTable(row1: BookStatistic, row2: BookStatistic) {
    const isTitleSort = $lastStatisticsSummarySortProperty$ === 'title';
    const isDateKeySort = $lastStatisticsSummarySortProperty$ === 'dateKey';
    const row1Prop = row1[$lastStatisticsSummarySortProperty$] || (isTitleSort ? '' : 0);
    const row2Prop = row2[$lastStatisticsSummarySortProperty$] || (isTitleSort ? '' : 0);

    let sortDiff: number;

    if ($lastStatisticsSummarySortDirection$ === SortDirection.ASC) {
      if (isTitleSort) {
        sortDiff = compareBookTitles(row1.title, row2.title);
      } else if (isDateKeySort) {
        if (row1Prop === row2Prop) {
          sortDiff = 0;
        } else {
          sortDiff = row1Prop > row2Prop ? 1 : -1;
        }
      } else {
        sortDiff = +row1Prop - +row2Prop;
      }
    } else if (isTitleSort) {
      sortDiff = compareBookTitles(row2.title, row1.title);
    } else if (isDateKeySort) {
      if (row1Prop === row2Prop) {
        sortDiff = 0;
      } else {
        sortDiff = row2Prop > row1Prop ? 1 : -1;
      }
    } else {
      sortDiff = +row2Prop - +row1Prop;
    }

    if (!sortDiff) {
      sortDiff = compareBookTitles(row1.title, row2.title);
    }

    return sortDiff;
  }

  function setRowInEditMode(row?: BookStatistic) {
    if (row) {
      rowInEditTime = row.readingTime;
      rowInEditCharacters = row.charactersRead;
      rowInEditResetMinMaxValues = false;
      rowInEdit = row;
    } else {
      rowInEdit = undefined;
      rowInEditTime = 0;
      rowInEditCharacters = 0;
      rowInEditResetMinMaxValues = false;
    }
  }
</script>

<div class="my-4" class:hidden={!aggregatedStatistics.length}>
  Data for {statisticsDateRangeLabel}
</div>
<div
  role="region"
  aria-label="Statistics summary"
  class="p-2"
  class:flex={!sortedData.length}
  class:justify-center={!sortedData.length}
  class:items-center={!sortedData.length}
  class:text-4xl={!sortedData.length}
>
  {#if sortedData.length}
    {@const isNoneAggregation =
      $lastPrimaryReadingDataAggregationMode$ === StatisticsReadingDataAggregationMode.NONE}
    {@const isDateAggregation =
      $lastPrimaryReadingDataAggregationMode$ === StatisticsReadingDataAggregationMode.DATE}
    {@const isTitleAggregation =
      $lastPrimaryReadingDataAggregationMode$ === StatisticsReadingDataAggregationMode.TITLE}
    <div
      class="sticky top-12 z-20 grid w-full min-w-232 gap-x-8 items-center border-b-2 border-gray-200 bg-(--background-color)"
      class:grid-cols-[3rem_8rem_minmax(12rem,1fr)_8rem_8rem_8rem]={isNoneAggregation}
      class:grid-cols-[3rem_8rem_8rem_8rem_8rem]={isDateAggregation}
      class:grid-cols-[3rem_minmax(14rem,1fr)_8rem_8rem_8rem]={isTitleAggregation}
      style:grid-auto-rows={`${statisticsSummaryBaseRowRem}rem`}
    >
      <div></div>
      <StatisticsSummaryHeader
        statisticsSummaryKey={StatisticsSummaryKey.DATE}
        options={dateDataSources}
        selectionKey={StatisticsSummaryKey.DATE}
        hasRowInEdit={rowInEdit !== undefined}
        isHidden={isTitleAggregation}
        title="Click to select/sort by this attribute"
        onpropertyChange={handlePropertyChange}
      />
      <StatisticsSummaryHeader
        statisticsSummaryKey={StatisticsSummaryKey.TITLE}
        options={titleDataSources}
        selectionKey={StatisticsSummaryKey.TITLE}
        hasRowInEdit={rowInEdit !== undefined}
        isHidden={isDateAggregation}
        title="Click to select/sort by this attribute"
        onpropertyChange={handlePropertyChange}
      />
      <StatisticsSummaryHeader
        statisticsSummaryKey={StatisticsSummaryKey.READING_TIME}
        options={readingTimeDataSources}
        selectionKey={$lastReadingTimeDataSource$}
        hasRowInEdit={rowInEdit !== undefined}
        title="Switch between Reading Time Attributes"
        onpropertyChange={handlePropertyChange}
      />
      <StatisticsSummaryHeader
        statisticsSummaryKey={StatisticsSummaryKey.CHARACTERS}
        options={charactersDataSources}
        selectionKey={$lastCharactersDataSource$}
        hasRowInEdit={rowInEdit !== undefined}
        title="Switch between Character Attributes"
        onpropertyChange={handlePropertyChange}
      />
      <StatisticsSummaryHeader
        statisticsSummaryKey={StatisticsSummaryKey.READING_SPEED}
        options={readingSpeedDataSources}
        selectionKey={$lastReadingSpeedDataSource$}
        hasRowInEdit={rowInEdit !== undefined}
        title="Switch between Reading Speed Attributes"
        onpropertyChange={handlePropertyChange}
      />
    </div>
    <div
      class="grid w-full min-w-232 gap-x-8 items-center"
      class:grid-cols-[3rem_8rem_minmax(12rem,1fr)_8rem_8rem_8rem]={isNoneAggregation}
      class:grid-cols-[3rem_8rem_8rem_8rem_8rem]={isDateAggregation}
      class:grid-cols-[3rem_minmax(14rem,1fr)_8rem_8rem_8rem]={isTitleAggregation}
      style:grid-auto-rows={`${statisticsSummaryBaseRowRem}rem`}
      style:row-gap={`${statisticsSummaryBaseRowGap}rem`}
      style:margin-top={`${statisticsSummaryBaseRowGap}rem`}
    >
      {#each sortedData as currentStatisticsSummaryRow (currentStatisticsSummaryRow.id)}
        {@const currentRowInEdit = rowInEdit && rowInEdit.id === currentStatisticsSummaryRow.id}
        {@const otherRowInEdit = rowInEdit && !currentRowInEdit}
        {@const title = displayTitle(currentStatisticsSummaryRow.title)}
        {@const titleLang = japaneseLangIfNeeded(title)}
        <div class="col-span-2 md:col-span-1">
          <button
            class="hover:text-red-500"
            class:cursor-not-allowed={otherRowInEdit}
            title={otherRowInEdit ? '' : `${rowInEdit ? 'Cancel Edit' : 'Delete Row'}`}
            disabled={otherRowInEdit}
            onclick={() => {
              if (rowInEdit) {
                setRowInEditMode();
              } else {
                dispatchDeleteRequest(currentStatisticsSummaryRow);
              }
            }}
          >
            <Fa icon={currentRowInEdit ? faXmark : faTrash} />
          </button>
          {#if isNoneAggregation}
            <button
              class="ml-2 hover:text-red-500"
              class:cursor-not-allowed={otherRowInEdit}
              title={otherRowInEdit ? '' : `${rowInEdit ? 'Save Changes' : 'Edit Row'}`}
              disabled={otherRowInEdit}
              onclick={() => {
                if (rowInEdit) {
                  onedit?.({
                    dateKey: rowInEdit.dateKey,
                    title: rowInEdit.title,
                    newReadingTime: rowInEditTime,
                    newCharactersRead: rowInEditCharacters,
                    resetMinMaxValues: rowInEditResetMinMaxValues
                  });
                  setRowInEditMode();
                } else {
                  setRowInEditMode(currentStatisticsSummaryRow);
                }
              }}
            >
              <Fa icon={currentRowInEdit ? faFloppyDisk : faPen} />
            </button>
          {/if}
        </div>
        <div class="whitespace-nowrap" class:hidden={isTitleAggregation}>
          {currentStatisticsSummaryRow.dateKey}
        </div>
        <div class="line-clamp-2" class:hidden={isDateAggregation} {title} lang={titleLang}>
          {title}
        </div>
        {#if currentRowInEdit}
          <input
            class="w-full"
            type="number"
            bind:value={rowInEditTime}
            onchange={() => {
              if (rowInEdit && (!Number.isFinite(rowInEditTime) || rowInEditTime < 0)) {
                rowInEditTime = rowInEdit.readingTime;
              }
            }}
          />
        {:else}
          <button
            class="text-left"
            class:blur={$lastBlurredTrackerItems$.has('readingTime')}
            onclick={(event) => {
              statisticsSummaryPopoverDetails = [
                `Time: ${secondsToMinutes(currentStatisticsSummaryRow.readingTime)} min`,
                `Average Time: ${secondsToMinutes(
                  currentStatisticsSummaryRow.averageReadingTime
                )} min`,
                `Weighted Time: ${secondsToMinutes(
                  currentStatisticsSummaryRow.averageWeightedReadingTime
                )} min`
              ];

              tick().then(() => {
                if (event.target instanceof HTMLElement) {
                  statisticsSummaryPopover?.toggleOpen(event.target);
                }
              });
            }}
          >
            {secondsToMinutes(
              getNumberFromObject(currentStatisticsSummaryRow, $lastReadingTimeDataSource$)
            )} min
          </button>
        {/if}
        {#if currentRowInEdit}
          <input
            class="w-full"
            type="number"
            bind:value={rowInEditCharacters}
            onchange={() => {
              if (rowInEdit && (!Number.isFinite(rowInEditCharacters) || rowInEditCharacters < 0)) {
                rowInEditCharacters = rowInEdit.charactersRead;
              }
            }}
          />
        {:else}
          <button
            class="text-left"
            class:blur={$lastBlurredTrackerItems$.has('charactersRead')}
            onclick={(event) => {
              statisticsSummaryPopoverDetails = [
                `Characters: ${currentStatisticsSummaryRow.charactersRead}`,
                `Average Characters: ${currentStatisticsSummaryRow.averageCharactersRead}`,
                `Weighted Characters: ${currentStatisticsSummaryRow.averageWeightedCharactersRead}`
              ];

              tick().then(() => {
                if (event.target instanceof HTMLElement) {
                  statisticsSummaryPopover?.toggleOpen(event.target);
                }
              });
            }}
          >
            {getNumberFromObject(currentStatisticsSummaryRow, $lastCharactersDataSource$)}
          </button>
        {/if}
        {#if currentRowInEdit}
          <div class="flex items-center">
            <input id="reset-min-max" type="checkbox" bind:checked={rowInEditResetMinMaxValues} />
            <label for="reset-min-max" class="ml-1">Reset Min/Max</label>
          </div>
        {:else}
          <button
            class="text-left"
            class:blur={$lastBlurredTrackerItems$.has('lastReadingSpeed')}
            onclick={(event) => {
              statisticsSummaryPopoverDetails = [
                `Speed: ${currentStatisticsSummaryRow.lastReadingSpeed}`,
                `Min Speed: ${currentStatisticsSummaryRow.minReadingSpeed}`,
                `Alt Min Speed: ${currentStatisticsSummaryRow.altMinReadingSpeed}`,
                `Max Speed: ${currentStatisticsSummaryRow.maxReadingSpeed}`
              ];

              tick().then(() => {
                if (event.target instanceof HTMLElement) {
                  statisticsSummaryPopover?.toggleOpen(event.target);
                }
              });
            }}
          >
            {getNumberFromObject(currentStatisticsSummaryRow, $lastReadingSpeedDataSource$)} / h
          </button>
        {/if}
      {/each}
    </div>
    {#if statisticsSummaryPopoverDetails.length}
      <Popover
        placement="top-start"
        yOffset={5}
        containerStyles={`align-self:flex-start;display:${isDateAggregation ? 'none' : 'flex'}`}
        bind:this={statisticsSummaryPopover}
      >
        {#snippet content()}
          <div class="p-4">
            <button
              title="Close details"
              class="flex w-full justify-end absolute top-1 right-2"
              onclick={() => (statisticsSummaryPopoverDetails = [])}
            >
              <Fa icon={faClose} />
            </button>
            {#each statisticsSummaryPopoverDetails as popoverDetail, index (`${popoverDetail}-${index}`)}
              <div class="mb-2 last:mb-0">
                {popoverDetail}
              </div>
            {/each}
          </div>
        {/snippet}
      </Popover>
    {/if}
  {:else}
    No Data found for {statisticsDateRangeLabel}
  {/if}
</div>
