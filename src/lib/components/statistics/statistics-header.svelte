<script lang="ts">
  import type { RouteId } from '$app/types';
  import {
    faCalendarDays,
    faCopy,
    faFilter,
    faMap,
    faSliders
  } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import HeaderMenuButton from '$lib/components/header-menu-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import type { StatisticsRoute } from '$lib/components/statistics/statistics-route';
  import {
    copyStatisticsData$,
    statisticsTitleFilterEnabled$,
    statisticsTitleFilterIsOpen$,
    type StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import { baseHeaderClasses, headerDividerClasses } from '$lib/css-classes';

  interface Props {
    activeRouteId?: RouteId | null;
    showStatisticsSettings: boolean;
    onselecttab?: (href: StatisticsRoute) => void;
  }

  let { activeRouteId, showStatisticsSettings = $bindable(), onselecttab }: Props = $props();

  const copyStatisticsDataItems: StatisticsDataSource[] = [
    { key: 'readingTime', label: 'Reading Time' },
    { key: 'charactersRead', label: 'Characters Read' }
  ];

  let summarySelected = $derived(activeRouteId === '/statistics/summary');
  let heatmapSelected = $derived(activeRouteId === '/statistics/heatmap');
</script>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <div class={baseHeaderClasses}>
    <div class="flex h-full justify-between">
      <div class="flex">
        <HeaderButton
          faIcon={faCalendarDays}
          label="Summary"
          selected={summarySelected}
          variant="tab"
          title={summarySelected ? undefined : 'Switch to Summary tab'}
          onclick={() => onselecttab?.('/statistics/summary')}
        />
        <HeaderButton
          faIcon={faMap}
          label="Heatmap"
          selected={heatmapSelected}
          variant="tab"
          title={heatmapSelected ? undefined : 'Switch to Heatmap tab'}
          onclick={() => onselecttab?.('/statistics/heatmap')}
        />
        <div class={headerDividerClasses}></div>
        <HeaderButton
          faIcon={faFilter}
          title="Open title filter menu"
          label="Filter"
          disabled={!$statisticsTitleFilterEnabled$}
          onclick={() => {
            if ($statisticsTitleFilterEnabled$) {
              $statisticsTitleFilterIsOpen$ = true;
            }
          }}
        />
        <HeaderButton
          faIcon={faSliders}
          title="Open statistics settings"
          label="Statistics Settings"
          onclick={() => (showStatisticsSettings = true)}
        />
      </div>
      <div class="flex">
        <HeaderMenuButton
          faIcon={faCopy}
          title="Copy data in TMW log format"
          label="Copy"
          items={copyStatisticsDataItems}
          onselect={(copyStatisticsDataItem) =>
            copyStatisticsData$.next(copyStatisticsDataItem.key)}
        />
        <div class={headerDividerClasses}></div>
        <HeaderNavTabs />
      </div>
    </div>
  </div>
</div>
