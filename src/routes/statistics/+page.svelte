<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { faSpinner } from '@fortawesome/free-solid-svg-icons';
  import SidebarOverlay from '$lib/components/sidebar-overlay.svelte';
  import { HeatmapType } from '$lib/components/statistics/statistics-heatmap/statistics-heatmap';
  import StatisticsHeatmap from '$lib/components/statistics/statistics-heatmap/statistics-heatmap.svelte';
  import StatisticsHeader from '$lib/components/statistics/statistics-header.svelte';
  import StatisticsSettings from '$lib/components/statistics/statistics-settings.svelte';
  import StatisticsSummary from '$lib/components/statistics/statistics-summary/statistics-summary.svelte';
  import StatisticsTitleFilter from '$lib/components/statistics/statistics-title-filter.svelte';
  import { StatisticsController } from '$lib/components/statistics/statistics-controller.svelte';
  import {
    getStatisticsBookFilterKey,
    getStatisticsBookIds,
    getStatisticsURL,
    getValidStatisticsView,
    statisticsViewQueryParam,
    type StatisticsView
  } from '$lib/components/statistics/statistics-view';
  import { pxScreen } from '$lib/css-classes';
  import {
    lastReadingDataHeatmapAggregationMode$,
    lastReadingGoalsHeatmapAggregationMode$,
    lastStatisticsFilterDateRangeOnly$,
    lastStatisticsView$
  } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { onMount } from 'svelte';
  import Fa from 'svelte-fa';

  const controller = new StatisticsController();

  let appliedBookFilterKey = $state<string>();
  let searchParams = $derived(browser ? page.url.searchParams : new URLSearchParams());
  let requestedStatisticsBookIds = $derived(getStatisticsBookIds(searchParams));
  let requestedStatisticsBookFilterKey = $derived(
    getStatisticsBookFilterKey(requestedStatisticsBookIds)
  );
  let requestedStatisticsView = $derived(searchParams.get(statisticsViewQueryParam));
  let activeView = $derived(
    getValidStatisticsView(requestedStatisticsView ?? $lastStatisticsView$)
  );
  let statisticsPageTitle = $derived(
    activeView === 'summary' ? 'Statistics Summary' : 'Statistics Heatmap'
  );

  onMount(() => {
    void controller.init(requestedStatisticsBookIds);
  });

  $effect(() => {
    if (!browser) return;

    if (requestedStatisticsView !== activeView) {
      goto(resolve(getStatisticsURL(activeView, requestedStatisticsBookIds)), {
        replaceState: true,
        noScroll: true,
        keepFocus: true
      });
      return;
    }

    if ($lastStatisticsView$ !== activeView) {
      $lastStatisticsView$ = activeView;
    }
  });

  $effect(() => {
    if (controller.isLoading) return;

    const filterKey = requestedStatisticsBookFilterKey;

    if (appliedBookFilterKey === filterKey) {
      return;
    }

    appliedBookFilterKey = filterKey;
    controller.applyBookFilterIds(requestedStatisticsBookIds);
  });

  function navigateToStatisticsTab(view: StatisticsView) {
    if (view === activeView && requestedStatisticsView === view) {
      return;
    }

    const filterURLState = controller.getBookFilterURLState();
    const bookIds = filterURLState.shouldUpdate
      ? filterURLState.bookIds
      : requestedStatisticsBookIds;

    $lastStatisticsView$ = view;
    goto(resolve(getStatisticsURL(view, bookIds)), {
      keepFocus: true,
      noScroll: true
    });
  }

  function handleTitleFilterToggle(title: string, isSelected: boolean) {
    controller.setTitleFilterSelection(title, isSelected);
    updateBookFilterURL();
  }

  function handleTitleFilterToggleAll(titles: Iterable<string>, isSelected: boolean) {
    controller.setTitleFilterSelectionsForTitles(titles, isSelected);
    updateBookFilterURL();
  }

  function updateBookFilterURL() {
    const filterURLState = controller.getBookFilterURLState();

    if (!filterURLState.shouldUpdate) {
      return;
    }

    goto(resolve(getStatisticsURL(activeView, filterURLState.bookIds)), {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }
</script>

<svelte:head>
  <title>{formatPageTitle(statisticsPageTitle)}</title>
</svelte:head>
<svelte:window onkeyup={(ev) => controller.handleKeyUp(ev)} />
<StatisticsHeader
  {activeView}
  titleFilterEnabled={controller.titleFilterEnabled}
  oncopydata={(dataKey) => controller.copyStatisticsData(dataKey)}
  onopenfilter={() => (controller.titleFilterIsOpen = true)}
  onopensettings={() => (controller.showStatisticsSettings = true)}
  onselecttab={navigateToStatisticsTab}
/>

<div class="{pxScreen} flex h-full flex-col pt-16">
  {#if controller.isLoading}
    <div class="fixed inset-0 flex size-full items-center justify-center text-7xl">
      <Fa icon={faSpinner} spin />
    </div>
  {:else if activeView === 'summary'}
    <StatisticsSummary
      aggregatedStatistics={controller.aggregatedStatistics}
      statisticsDateRangeLabel={controller.statisticsDateRangeLabel}
      ondelete={(request) => controller.handleDeleteRequest(request)}
      onedit={(request) => controller.handleEditRequest(request)}
    />
  {:else}
    <StatisticsHeatmap
      statisticsData={controller.statisticsData}
      readingGoals={controller.readingGoals}
      statisticsTitleFilters={controller.statisticsTitleFilters}
      bind:heatmapAggregration={$lastReadingDataHeatmapAggregationMode$}
    />
    {#if controller.readingGoals.length}
      <div class="mt-8 sm:mt-16">
        <StatisticsHeatmap
          statisticsData={controller.statisticsData}
          readingGoals={controller.readingGoals}
          statisticsTitleFilters={controller.statisticsTitleFilters}
          heatmapType={HeatmapType.READING_GOALS}
          bind:heatmapAggregration={$lastReadingGoalsHeatmapAggregationMode$}
        />
      </div>
    {/if}
  {/if}
</div>

<SidebarOverlay
  bind:open={controller.titleFilterIsOpen}
  side="right"
  class="overflow-hidden bg-gray-700 text-white"
  closeTitle="Close book filter"
>
  <StatisticsTitleFilter
    statisticsTitleFilters={controller.statisticsTitleFilters}
    titlesInStatisticsDateRange={controller.titlesInStatisticsDateRange}
    bind:filterDateRangeOnly={$lastStatisticsFilterDateRangeOnly$}
    ontitlefiltertoggle={handleTitleFilterToggle}
    ontitlefiltertoggleall={handleTitleFilterToggleAll}
  />
</SidebarOverlay>

<SidebarOverlay
  bind:open={controller.showStatisticsSettings}
  side="right"
  class="overflow-hidden bg-gray-700 text-white"
  closeTitle="Close statistics settings"
>
  <StatisticsSettings
    ondeletestatisticsdata={(deleteAllData) => controller.deleteStatisticsData(deleteAllData)}
    onexportstatisticsdata={(exportAllData) => {
      void controller.exportStatisticsData(exportAllData);
    }}
    onsetstatisticsdatestoalltime={() => controller.setStatisticsDatesToAllTime()}
    onstatisticsDateChange={(change) => controller.handleSelectedStatisticsDateChange(change)}
  />
</SidebarOverlay>

{#if controller.actionInProgress}
  <div class="tap-highlight-transparent fixed inset-0 z-70 bg-black/20"></div>
  <div class="fixed inset-0 flex size-full items-center justify-center text-7xl">
    <Fa icon={faSpinner} spin />
  </div>
{/if}
