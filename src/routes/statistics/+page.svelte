<script lang="ts">
  import StatisticsContent from '$lib/components/statistics/statistics-content.svelte';
  import StatisticsHeader from '$lib/components/statistics/statistics-header.svelte';
  import StatisticsSettings from '$lib/components/statistics/statistics-settings.svelte';
  import SidebarOverlay from '$lib/components/sidebar-overlay.svelte';
  import {
    StatisticsRangeTemplate,
    type StatisticsDateChange,
    preFilteredTitlesForStatistics$
  } from '$lib/components/statistics/statistics-types';
  import { pxScreen } from '$lib/css-classes';
  import {
    lastStartDayOfWeek$,
    lastStatisticsEndDate$,
    lastStatisticsRangeTemplate$,
    lastStatisticsStartDate$,
    startDayHoursForTracker$
  } from '$lib/data/store';
  import {
    advanceDateDays,
    getDateKey,
    getDateString,
    getStartHoursDate
  } from '$lib/functions/statistic-util';
  import { onDestroy, tick } from 'svelte';

  let showStatisticsSettings = $state(false);

  $effect(() => {
    if ($lastStatisticsRangeTemplate$ || $lastStartDayOfWeek$ > -1) {
      tick().then(() => setSelectedStatisticsDays());
    }
  });

  onDestroy(() => ($preFilteredTitlesForStatistics$ = new Set()));

  function handleSelectedStatisticsDateChange({ dateString, isStartDate }: StatisticsDateChange) {
    const referenceDate = getStartHoursDate($startDayHoursForTracker$);
    const todayKey = getDateKey($startDayHoursForTracker$, referenceDate);

    $lastStatisticsRangeTemplate$ = StatisticsRangeTemplate.CUSTOM;

    if (isStartDate) {
      $lastStatisticsStartDate$ = dateString || todayKey;
    } else {
      $lastStatisticsEndDate$ = dateString || todayKey;
    }

    if ($lastStatisticsStartDate$ > $lastStatisticsEndDate$) {
      const originalStartDate = $lastStatisticsStartDate$;
      const originalEndDate = $lastStatisticsEndDate$;

      $lastStatisticsStartDate$ = originalEndDate;
      $lastStatisticsEndDate$ = originalStartDate;
    }

    setSelectedStatisticsDays(referenceDate);
  }

  function setSelectedStatisticsDays(referenceDate = getStartHoursDate($startDayHoursForTracker$)) {
    switch ($lastStatisticsRangeTemplate$) {
      case StatisticsRangeTemplate.TODAY: {
        const dateKey = getDateString(referenceDate);

        $lastStatisticsStartDate$ = dateKey;
        $lastStatisticsEndDate$ = dateKey;
        break;
      }
      case StatisticsRangeTemplate.WEEK: {
        const dayIndex = referenceDate.getDay();

        let dayDiff = 0;

        if ($lastStartDayOfWeek$ !== dayIndex) {
          if (!$lastStartDayOfWeek$) {
            dayDiff = -dayIndex;
          } else if (!dayIndex) {
            dayDiff = $lastStartDayOfWeek$ - 7;
          } else {
            dayDiff =
              $lastStartDayOfWeek$ > dayIndex
                ? $lastStartDayOfWeek$ - dayIndex - 7
                : $lastStartDayOfWeek$ - dayIndex;
          }
        }

        ({ dateString: $lastStatisticsStartDate$ } = advanceDateDays(referenceDate, dayDiff));
        ({ dateString: $lastStatisticsEndDate$ } = advanceDateDays(referenceDate, 6));
        break;
      }
      case StatisticsRangeTemplate.MONTH: {
        referenceDate.setDate(1);

        $lastStatisticsStartDate$ = getDateString(referenceDate);

        referenceDate.setMonth(referenceDate.getMonth() + 1);

        ({ dateString: $lastStatisticsEndDate$ } = advanceDateDays(referenceDate, -1));
        break;
      }
      case StatisticsRangeTemplate.YEAR: {
        referenceDate.setMonth(0);
        referenceDate.setDate(1);

        $lastStatisticsStartDate$ = getDateString(referenceDate);

        referenceDate.setFullYear(referenceDate.getFullYear() + 1);

        ({ dateString: $lastStatisticsEndDate$ } = advanceDateDays(referenceDate, -1));
        break;
      }
      default:
        break;
    }
  }
</script>

<StatisticsHeader bind:showStatisticsSettings />

<div class="{pxScreen} flex h-full flex-col pt-16 xl:pt-14">
  <StatisticsContent />
</div>

<SidebarOverlay
  bind:open={showStatisticsSettings}
  side="right"
  class="overflow-hidden bg-gray-700 text-white"
>
  <StatisticsSettings onstatisticsDateChange={handleSelectedStatisticsDateChange} />
</SidebarOverlay>
