<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { faSpinner } from '@fortawesome/free-solid-svg-icons';
  import SidebarOverlay from '$lib/components/sidebar-overlay.svelte';
  import { HeatmapType } from '$lib/components/statistics/statistics-heatmap/statistics-heatmap';
  import StatisticsHeatmap from '$lib/components/statistics/statistics-heatmap/statistics-heatmap.svelte';
  import StatisticsGoals from '$lib/components/statistics/statistics-goals.svelte';
  import StatisticsHeader from '$lib/components/statistics/statistics-header.svelte';
  import StatisticsViewOptions from '$lib/components/statistics/statistics-view-options.svelte';
  import StatisticsSummary from '$lib/components/statistics/statistics-summary/statistics-summary.svelte';
  import StatisticsTitleFilter from '$lib/components/statistics/statistics-title-filter.svelte';
  import { StatisticsController } from '$lib/components/statistics/statistics-controller.svelte';
  import {
    getStatisticsBookFilterKey,
    getStatisticsBookTitles,
    getStatisticsURL,
    getValidStatisticsView,
    statisticsLegacyBookQueryParam,
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
  import Fa from 'svelte-fa';

  const controller = new StatisticsController();

  let appliedBookFilterKey = $state<string>();
  let searchParams = $derived(browser ? page.url.searchParams : new URLSearchParams());
  let hasLegacyBookIds = $derived(searchParams.has(statisticsLegacyBookQueryParam));
  let requestedStatisticsBookTitles = $derived(getStatisticsBookTitles(searchParams));
  let requestedStatisticsBookFilterKey = $derived(
    getStatisticsBookFilterKey(requestedStatisticsBookTitles)
  );
  let requestedStatisticsView = $derived(searchParams.get(statisticsViewQueryParam));
  let activeView = $derived(
    getValidStatisticsView(requestedStatisticsView ?? $lastStatisticsView$)
  );
  const statisticsPageTitles: Record<StatisticsView, string> = {
    summary: 'Statistics Summary',
    heatmap: 'Statistics Heatmap',
    goals: 'Reading Goals'
  };
  let statisticsPageTitle = $derived(statisticsPageTitles[activeView]);

  let goalsInitialization: Promise<void> | undefined;
  let statisticsInitialization: Promise<void> | undefined;

  $effect(() => {
    if (!browser) return;

    if (activeView === 'goals') {
      goalsInitialization ??= controller.initGoals();
    } else if (!statisticsInitialization) {
      statisticsInitialization = goalsInitialization
        ? goalsInitialization.then(() => controller.init(requestedStatisticsBookTitles))
        : controller.init(requestedStatisticsBookTitles);
      goalsInitialization ??= statisticsInitialization;
    }
  });

  $effect(() => {
    if (!browser) return;

    if (hasLegacyBookIds) {
      // Pre-title URLs filtered by the per-device numeric id; nothing stable
      // to map it to, so drop the filter and show the unfiltered view.
      goto(resolve(getStatisticsURL(activeView)), {
        replaceState: true,
        noScroll: true,
        keepFocus: true
      });
      return;
    }

    if (requestedStatisticsView !== activeView) {
      goto(resolve(getStatisticsURL(activeView, requestedStatisticsBookTitles)), {
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
    if (controller.isLoading || hasLegacyBookIds) return;

    const filterKey = requestedStatisticsBookFilterKey;

    if (appliedBookFilterKey === filterKey) {
      return;
    }

    appliedBookFilterKey = filterKey;
    controller.applyBookFilterTitles(requestedStatisticsBookTitles);
  });

  function getStatisticsTabHref(view: StatisticsView) {
    // Prefer the controller's live filter state, but when it reports "no
    // filter" — every title selected, e.g. because a URL prefilter happens to
    // cover every book with statistics — keep the URL's explicit titles.
    // Filter toggles sync to the URL immediately, so the URL is authoritative
    // whenever the controller has nothing narrower to say.
    const { bookTitles } = controller.getBookFilterURLState();

    return resolve(getStatisticsURL(view, bookTitles ?? requestedStatisticsBookTitles));
  }

  let summaryHref = $derived(getStatisticsTabHref('summary'));
  let heatmapHref = $derived(getStatisticsTabHref('heatmap'));
  let goalsHref = $derived(getStatisticsTabHref('goals'));

  function handleTitleFilterToggle(title: string, isSelected: boolean) {
    controller.setTitleFilterSelection(title, isSelected);
    updateBookFilterURL();
  }

  function handleTitleFilterToggleAll(titles: Iterable<string>, isSelected: boolean) {
    controller.setTitleFilterSelectionsForTitles(titles, isSelected);
    updateBookFilterURL();
  }

  function updateBookFilterURL() {
    goto(resolve(getStatisticsURL(activeView, controller.getBookFilterURLState().bookTitles)), {
      replaceState: true,
      noScroll: true,
      keepFocus: true
    });
  }

  function handleKeydown(event: KeyboardEvent) {
    if (activeView !== 'goals') {
      controller.handleKeydown(event);
    }
  }
</script>

<svelte:head>
  <title>{formatPageTitle(statisticsPageTitle)}</title>
</svelte:head>
<svelte:window onkeydown={handleKeydown} />
<StatisticsHeader
  {activeView}
  titleFilterEnabled={activeView !== 'goals' && controller.titleFilterEnabled}
  oncopydata={(dataKey) => controller.copyStatisticsData(dataKey)}
  onopenfilter={() => (controller.titleFilterIsOpen = true)}
  onopenviewoptions={() => (controller.viewOptionsIsOpen = true)}
  {summaryHref}
  {heatmapHref}
  {goalsHref}
/>

<div class="{pxScreen} flex min-h-full flex-col pt-16">
  {#if controller.isLoading}
    <div class="fixed inset-0 flex size-full items-center justify-center text-7xl">
      <Fa icon={faSpinner} spin />
    </div>
  {:else if activeView === 'goals'}
    <StatisticsGoals
      readingGoals={controller.readingGoals}
      onspinner={(value) => (controller.actionInProgress = value)}
      ongoalschange={(readingGoals) => (controller.readingGoals = readingGoals)}
    />
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
  bind:open={controller.viewOptionsIsOpen}
  side="right"
  class="overflow-hidden bg-gray-700 text-white"
  closeTitle="Close view options"
>
  <StatisticsViewOptions
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
