<script lang="ts">
  import { faCircleQuestion, faLeftLong, faRightLong } from '@fortawesome/free-solid-svg-icons';
  import ToggleSwitch from '$lib/components/toggle-switch.svelte';
  import {
    type StatisticsDateChange,
    statisticsRangeTemplates,
    readingTimeDataSources,
    charactersDataSources,
    readingSpeedDataSources,
    statisticsDataAggregrationModes,
    StatisticsReadingDataAggregationMode
  } from '$lib/components/statistics/statistics-types';
  import { daysOfWeek } from '$lib/components/statistics/statistics-heatmap/statistics-heatmap';
  import {
    confirmStatisticsDeletion$,
    lastCharactersDataSource$,
    lastPrimaryReadingDataAggregationMode$,
    lastReadingSpeedDataSource$,
    lastReadingTimeDataSource$,
    lastStartDayOfWeek$,
    lastStatisticsEndDate$,
    lastStatisticsRangeTemplate$,
    lastStatisticsStartDate$
  } from '$lib/data/store';
  import Fa from 'svelte-fa';

  interface Props {
    ondeletestatisticsdata: (deleteAllStatisticsData: boolean) => void;
    onexportstatisticsdata: (exportAllStatisticsData: boolean) => void;
    onsetstatisticsdatestoalltime: () => void;
    onstatisticsDateChange: (data: StatisticsDateChange) => void;
  }

  let {
    ondeletestatisticsdata,
    onexportstatisticsdata,
    onsetstatisticsdatestoalltime,
    onstatisticsDateChange
  }: Props = $props();

  const weekDays = [...daysOfWeek.slice(1, 7), daysOfWeek[0]].map((day, index) => {
    if (day === 'Sunday') {
      return { day, index: 0 };
    }
    return { day, index: index + 1 };
  });

  let selectedStatisticsStartDate = $derived($lastStatisticsStartDate$);

  let selectedStatisticsEndDate = $derived($lastStatisticsEndDate$);

  const componentId = $props.id();
</script>

{#snippet settingLabel(inputId: string, label: string, helpLabel: string, helpText: string)}
  {@const popoverId = `${componentId}-${inputId}-help`}
  <div class="flex items-center">
    <label for={inputId}>{label}</label>
    <button class="mx-2" aria-label={helpLabel} popovertarget={popoverId}>
      <Fa icon={faCircleQuestion} />
    </button>
    <div
      popover
      data-testid="statistics-help"
      id={popoverId}
      class="popover-surface-dark statistics-help-popover rounded-sm p-2"
    >
      {helpText}
    </div>
  </div>
{/snippet}

<div class="flex items-center justify-end p-4 pl-12">
  <button class="mr-2 sm:mr-4 hover:text-red-500" onclick={() => onexportstatisticsdata(false)}>
    Export Selection
  </button>
  <button class="mr-2 sm:mr-4 hover:text-red-500" onclick={() => ondeletestatisticsdata(false)}>
    Delete Selection
  </button>
  <button class="mr-2 sm:mr-4 hover:text-red-500" onclick={() => onexportstatisticsdata(true)}>
    Export All
  </button>
  <button class="hover:text-red-500" onclick={() => ondeletestatisticsdata(true)}>
    Delete All
  </button>
</div>
<div class="flex-1 p-4 overflow-auto">
  <div class="flex flex-col mb-6">
    <label for="datesTemplate">Template</label>
    <select id="datesTemplate" class="text-black" bind:value={$lastStatisticsRangeTemplate$}>
      {#each statisticsRangeTemplates as statisticsRangeTemplate (statisticsRangeTemplate)}
        <option value={statisticsRangeTemplate}>
          {statisticsRangeTemplate}
        </option>
      {/each}
    </select>
  </div>
  <div class="flex flex-col mb-4 sm:hidden">
    <label for="weekDay">Start of Week</label>
    <select id="weekDay" class="text-black" bind:value={$lastStartDayOfWeek$}>
      {#each weekDays as weekDay (weekDay.day)}
        <option value={weekDay.index}>
          {weekDay.day}
        </option>
      {/each}
    </select>
  </div>
  <div class="flex justify-between sm:flex-row">
    <div class="flex flex-col">
      <label for="fromDate">From</label>
      <input
        id="fromDate"
        type="date"
        class="text-black"
        bind:value={selectedStatisticsStartDate}
        onchange={() =>
          onstatisticsDateChange({
            isStartDate: true,
            dateString: selectedStatisticsStartDate
          })}
      />
    </div>
    <div class="flex flex-col justify-between pt-4 mx-2 text-xl sm:mx-0">
      <button
        onclick={() =>
          onstatisticsDateChange({
            isStartDate: false,
            dateString: selectedStatisticsStartDate
          })}
      >
        <Fa icon={faRightLong} />
      </button>
      <button
        onclick={() =>
          onstatisticsDateChange({
            isStartDate: true,
            dateString: selectedStatisticsEndDate
          })}
      >
        <Fa icon={faLeftLong} />
      </button>
    </div>
    <div class="flex flex-col">
      <label for="toDate">To</label>
      <input
        id="toDate"
        type="date"
        class="text-black"
        bind:value={selectedStatisticsEndDate}
        onchange={() =>
          onstatisticsDateChange({
            isStartDate: false,
            dateString: selectedStatisticsEndDate
          })}
      />
    </div>
    <div class="flex-col hidden sm:flex">
      <label for="weekDay">Start of Week</label>
      <select id="weekDay" class="text-black" bind:value={$lastStartDayOfWeek$}>
        {#each weekDays as weekDay (weekDay.day)}
          <option value={weekDay.index}>
            {weekDay.day}
          </option>
        {/each}
      </select>
    </div>
  </div>
  <button class="text-left mt-3 hover:text-red-500" onclick={() => onsetstatisticsdatestoalltime()}>
    Set to all time for the selected books
  </button>
  <div class="flex flex-wrap justify-between mt-4">
    <div class="flex flex-col my-2 w-full sm:w-[initial]">
      {@render settingLabel(
        'timeDataSource',
        'Time Data Source',
        'About reading-time attributes',
        'Reading Time Attribute which should be used for the Summary Tab'
      )}
      <select id="timeDataSource" class="text-black" bind:value={$lastReadingTimeDataSource$}>
        {#each readingTimeDataSources as readingTimeDataSource (readingTimeDataSource.key)}
          <option value={readingTimeDataSource.key}>
            {readingTimeDataSource.label}
          </option>
        {/each}
      </select>
    </div>
    <div class="flex flex-col my-2 w-full sm:w-[initial]">
      {@render settingLabel(
        'charactersSource',
        'Characters Data Source',
        'About character-count attributes',
        'Characters Read Attribute which should be used for the Summary Tab'
      )}
      <select id="charactersSource" class="text-black" bind:value={$lastCharactersDataSource$}>
        {#each charactersDataSources as charactersDataSource (charactersDataSource.key)}
          <option value={charactersDataSource.key}>
            {charactersDataSource.label}
          </option>
        {/each}
      </select>
    </div>
    <div class="flex flex-col my-2 w-full sm:w-[initial]">
      {@render settingLabel(
        'speedSource',
        'Speed Data Source',
        'About reading-speed attributes',
        'Reading Speed Attribute which should be used for the Summary Tab'
      )}
      <select id="speedSource" class="text-black" bind:value={$lastReadingSpeedDataSource$}>
        {#each readingSpeedDataSources as readingSpeedDataSource (readingSpeedDataSource.key)}
          <option value={readingSpeedDataSource.key}>
            {readingSpeedDataSource.label}
          </option>
        {/each}
      </select>
    </div>
  </div>
  <div class="flex flex-col mt-4">
    {@render settingLabel(
      'primaryAggregration',
      'Primary Aggregration',
      'About summary grouping',
      'Determines on which primary Attribute the Data will be grouped for the Summary Tab'
    )}
    <select
      id="primaryAggregration"
      class="text-black"
      bind:value={$lastPrimaryReadingDataAggregationMode$}
    >
      {#each statisticsDataAggregrationModes as statisticsDataAggregrationMode (statisticsDataAggregrationMode)}
        <option value={statisticsDataAggregrationMode}>
          {statisticsDataAggregrationMode === StatisticsReadingDataAggregationMode.TITLE
            ? 'Book'
            : statisticsDataAggregrationMode}
        </option>
      {/each}
    </select>
  </div>
  <ToggleSwitch
    id="confirm-statistics-deletion"
    label="Confirm Statistics Deletion"
    class="mt-8 mb-3"
    bind:checked={$confirmStatisticsDeletion$}
  />
</div>

<style>
  .statistics-help-popover {
    position-area: top span-right;
    margin-block-end: 4px;
    margin-inline-end: 8px;
    position-try-fallbacks:
      flip-inline,
      flip-block,
      flip-block flip-inline;
  }
</style>
