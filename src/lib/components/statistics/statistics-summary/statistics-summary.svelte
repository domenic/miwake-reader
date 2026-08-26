<script lang="ts">
  import { faFloppyDisk, faPen, faTrash, faXmark } from '@fortawesome/free-solid-svg-icons';
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
  import { bookOrder, byTitle, displayTitle } from '$lib/functions/book-title';
  import { byNumber, SortDirection, type Comparator } from '$lib/functions/sorting';
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
  import { untrack } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    aggregatedStatistics: BookStatistic[];
    statisticsDateRangeLabel: string;
    ondelete?: (request: StatisticsDeleteRequest) => void;
    onedit?: (request: StatisticsEditRequest) => void;
  }

  interface SummaryPopoverDetail {
    label: string;
    value: string;
  }

  let { aggregatedStatistics, statisticsDateRangeLabel, ondelete, onedit }: Props = $props();

  const statisticsSummaryBaseRowRem = 3;
  const statisticsSummaryBaseRowGap = 1.5;

  const componentId = $props.id();
  const detailsPopoverId = `${componentId}-details`;
  let statisticsSummaryPopoverDetails: SummaryPopoverDetail[] = $state([]);
  let rowInEdit = $state<BookStatistic>();
  let rowInEditTime = $state(0);
  let rowInEditCharacters = $state(0);
  let rowInEditResetMinMaxValues = $state(false);

  // Derive sorted data from the raw statistics + sort settings
  let sortedData = $derived.by(() =>
    [...aggregatedStatistics].sort(
      bookOrder(
        statisticComparator($lastStatisticsSummarySortProperty$),
        $lastStatisticsSummarySortDirection$
      )
    )
  );

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

  function statisticComparator(property: keyof BookStatistic): Comparator<BookStatistic> {
    switch (property) {
      case 'title':
        return byTitle;
      case 'dateKey':
        return (row1, row2) =>
          row1.dateKey === row2.dateKey ? 0 : row1.dateKey > row2.dateKey ? 1 : -1;
      default:
        return byNumber((row) => Number(row[property]) || 0);
    }
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
            aria-label="Reading time (seconds)"
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
            popovertarget={detailsPopoverId}
            onclick={() => {
              statisticsSummaryPopoverDetails = [
                {
                  label: 'Total Time',
                  value: `${secondsToMinutes(currentStatisticsSummaryRow.readingTime)} min`
                },
                {
                  label: 'Average Time',
                  value: `${secondsToMinutes(currentStatisticsSummaryRow.averageReadingTime)} min`
                },
                {
                  label: 'Weighted Time',
                  value: `${secondsToMinutes(
                    currentStatisticsSummaryRow.averageWeightedReadingTime
                  )} min`
                }
              ];
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
            aria-label="Characters read"
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
            popovertarget={detailsPopoverId}
            onclick={() => {
              statisticsSummaryPopoverDetails = [
                {
                  label: 'Total Characters',
                  value: `${currentStatisticsSummaryRow.charactersRead}`
                },
                {
                  label: 'Average Characters',
                  value: `${currentStatisticsSummaryRow.averageCharactersRead}`
                },
                {
                  label: 'Weighted Characters',
                  value: `${currentStatisticsSummaryRow.averageWeightedCharactersRead}`
                }
              ];
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
            popovertarget={detailsPopoverId}
            onclick={() => {
              statisticsSummaryPopoverDetails = [
                {
                  label: 'Speed',
                  value: `${currentStatisticsSummaryRow.lastReadingSpeed} / h`
                },
                {
                  label: 'Min Speed',
                  value: `${currentStatisticsSummaryRow.minReadingSpeed} / h`
                },
                {
                  label: 'Alt Min Speed',
                  value: `${currentStatisticsSummaryRow.altMinReadingSpeed} / h`
                },
                {
                  label: 'Max Speed',
                  value: `${currentStatisticsSummaryRow.maxReadingSpeed} / h`
                }
              ];
            }}
          >
            {getNumberFromObject(currentStatisticsSummaryRow, $lastReadingSpeedDataSource$)} / h
          </button>
        {/if}
      {/each}
    </div>
    <div
      popover
      data-testid="statistics-summary-details"
      id={detailsPopoverId}
      class="popover-surface-dark summary-details-popover rounded-sm p-4"
    >
      <dl class="grid gap-2 text-xs">
        {#each statisticsSummaryPopoverDetails as popoverDetail (popoverDetail.label)}
          <div class="grid grid-cols-[minmax(0,1fr)_auto] gap-4">
            <dt class="text-gray-300">{popoverDetail.label}</dt>
            <dd class="text-right whitespace-nowrap">{popoverDetail.value}</dd>
          </div>
        {/each}
      </dl>
    </div>
  {:else}
    No Data found for {statisticsDateRangeLabel}
  {/if}
</div>

<style>
  .summary-details-popover {
    position-area: top span-right;
    margin-block-end: 4px;
    position-try-fallbacks:
      flip-inline,
      flip-block,
      flip-block flip-inline;
  }
</style>
