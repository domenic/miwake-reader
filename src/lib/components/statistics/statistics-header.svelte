<script lang="ts">
  import type { ResolvedPathname } from '$app/types';
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
  import type { StatisticsView } from '$lib/components/statistics/statistics-view';
  import type {
    BookStatistic,
    StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import { baseHeaderClasses, headerDividerClasses } from '$lib/css-classes';

  interface Props {
    activeView: StatisticsView;
    titleFilterEnabled: boolean;
    oncopydata: (dataKey: keyof BookStatistic) => void;
    onopenfilter: () => void;
    onopensettings: () => void;
    summaryHref: ResolvedPathname;
    heatmapHref: ResolvedPathname;
  }

  let {
    activeView,
    titleFilterEnabled,
    oncopydata,
    onopenfilter,
    onopensettings,
    summaryHref,
    heatmapHref
  }: Props = $props();

  const copyStatisticsDataItems: StatisticsDataSource[] = [
    { key: 'readingTime', label: 'Reading Time' },
    { key: 'charactersRead', label: 'Characters Read' }
  ];

  let summarySelected = $derived(activeView === 'summary');
  let heatmapSelected = $derived(activeView === 'heatmap');
</script>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <div class={baseHeaderClasses}>
    <div class="flex h-full justify-between">
      <div class="flex" data-sveltekit-keepfocus data-sveltekit-noscroll>
        <HeaderButton
          faIcon={faCalendarDays}
          label="Summary"
          selected={summarySelected}
          variant="tab"
          title={summarySelected ? undefined : 'Switch to Summary tab'}
          href={summaryHref}
        />
        <HeaderButton
          faIcon={faMap}
          label="Heatmap"
          selected={heatmapSelected}
          variant="tab"
          title={heatmapSelected ? undefined : 'Switch to Heatmap tab'}
          href={heatmapHref}
        />
        <div class={headerDividerClasses}></div>
        <HeaderButton
          faIcon={faFilter}
          title="Open book filter menu"
          label="Filter"
          disabled={!titleFilterEnabled}
          onclick={() => {
            if (titleFilterEnabled) {
              onopenfilter();
            }
          }}
        />
        <HeaderButton
          faIcon={faSliders}
          title="Open statistics settings"
          label="Statistics Settings"
          onclick={onopensettings}
        />
      </div>
      <div class="flex">
        <HeaderMenuButton
          faIcon={faCopy}
          title="Copy data in TMW log format"
          label="Copy"
          items={copyStatisticsDataItems}
          onselect={(copyStatisticsDataItem) => oncopydata(copyStatisticsDataItem.key)}
        />
        <div class={headerDividerClasses}></div>
        <HeaderNavTabs />
      </div>
    </div>
  </div>
</div>
