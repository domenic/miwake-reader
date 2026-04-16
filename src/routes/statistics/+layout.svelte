<script lang="ts">
  import type { RouteId } from '$app/types';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import { onDestroy, tick } from 'svelte';
  import StatisticsHeader from '$lib/components/statistics/statistics-header.svelte';
  import {
    isStatisticsRoute,
    type StatisticsRoute
  } from '$lib/components/statistics/statistics-route';
  import StatisticsSettings from '$lib/components/statistics/statistics-settings.svelte';
  import SidebarOverlay from '$lib/components/sidebar-overlay.svelte';
  import {
    StatisticsRangeTemplate,
    preFilteredTitlesForStatistics$,
    type StatisticsDateChange
  } from '$lib/components/statistics/statistics-types';
  import { pxScreen } from '$lib/css-classes';
  import { pagePath } from '$lib/data/env';
  import {
    lastStartDayOfWeek$,
    lastStatisticsEndDate$,
    lastStatisticsRangeTemplate$,
    lastStatisticsRoute$,
    lastStatisticsStartDate$,
    startDayHoursForTracker$
  } from '$lib/data/store';
  import {
    advanceDateDays,
    getDateKey,
    getDateString,
    getStartHoursDate
  } from '$lib/functions/statistic-util';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  let showStatisticsSettings = $state(false);
  let activeRouteId = $derived(page.route.id as RouteId | null);

  $effect(() => {
    if (browser && isStatisticsRoute(page.route.id) && page.route.id !== $lastStatisticsRoute$) {
      $lastStatisticsRoute$ = page.route.id as StatisticsRoute;
    }
  });

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

  function navigateToStatisticsTab(href: StatisticsRoute) {
    if (href === page.route.id) {
      return;
    }

    goto(`${pagePath}${href}`, { keepFocus: true, noScroll: true });
  }
</script>

<StatisticsHeader
  bind:showStatisticsSettings
  {activeRouteId}
  onselecttab={navigateToStatisticsTab}
/>

<div class="{pxScreen} flex h-full flex-col pt-16">
  {@render children?.()}
</div>

<SidebarOverlay
  bind:open={showStatisticsSettings}
  side="right"
  class="overflow-hidden bg-gray-700 text-white"
>
  <StatisticsSettings onstatisticsDateChange={handleSelectedStatisticsDateChange} />
</SidebarOverlay>
