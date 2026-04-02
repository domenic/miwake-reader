<script lang="ts">
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
  import {
    StatisticsTab,
    copyStatisticsData$,
    statisticsTitleFilterEnabled$,
    statisticsTitleFilterIsOpen$,
    type StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import { baseHeaderClasses, headerDividerClasses, pxScreen } from '$lib/css-classes';
  import { lastStatisticsTab$ } from '$lib/data/store';

  interface Props {
    showStatisticsSettings: boolean;
  }

  let { showStatisticsSettings = $bindable() }: Props = $props();

  const copyStatisticsDataItems: StatisticsDataSource[] = [
    { key: 'readingTime', label: 'Reading Time' },
    { key: 'charactersRead', label: 'Characters Read' }
  ];
</script>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <div class={baseHeaderClasses}>
    <div class="{pxScreen} flex h-full justify-between px-0 md:px-5">
      <div class="flex">
        <HeaderButton
          faIcon={faCalendarDays}
          label="Summary"
          selected={$lastStatisticsTab$ === StatisticsTab.SUMMARY}
          variant="tab"
          title={$lastStatisticsTab$ === StatisticsTab.SUMMARY
            ? 'You are already on the Summary Tab'
            : 'Switch to Summary Tab'}
          onclick={() => ($lastStatisticsTab$ = StatisticsTab.SUMMARY)}
        />
        <HeaderButton
          faIcon={faMap}
          label="Heatmap"
          selected={$lastStatisticsTab$ === StatisticsTab.OVERVIEW}
          variant="tab"
          title={$lastStatisticsTab$ === StatisticsTab.OVERVIEW
            ? 'You are already on the Heatmap Tab'
            : 'Switch to Heatmap Tab'}
          onclick={() => ($lastStatisticsTab$ = StatisticsTab.OVERVIEW)}
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
