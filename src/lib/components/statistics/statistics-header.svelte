<script lang="ts">
  import {
    faCalendarDays,
    faCopy,
    faFilter,
    faMap,
    faSliders
  } from '@fortawesome/free-solid-svg-icons';
  import HeaderIconButton from '$lib/components/header-icon-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import HeaderTab from '$lib/components/header-tab.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import {
    StatisticsTab,
    copyStatisticsData$,
    statisticsTitleFilterEnabled$,
    statisticsTitleFilterIsOpen$,
    type StatisticsDataSource
  } from '$lib/components/statistics/statistics-types';
  import {
    baseHeaderClasses,
    headerDividerClasses,
    labelIconClasses,
    pxScreen
  } from '$lib/css-classes';
  import { lastStatisticsTab$ } from '$lib/data/store';
  import Fa from 'svelte-fa';

  interface Props {
    showStatisticsSettings: boolean;
  }

  let { showStatisticsSettings = $bindable() }: Props = $props();

  const copyStatisticsDataItems: StatisticsDataSource[] = [
    { key: 'readingTime', label: 'Reading Time' },
    { key: 'charactersRead', label: 'Characters Read' }
  ];

  let copyStatisticsDataPopover = $state<Popover>();
</script>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <div class={baseHeaderClasses}>
    <div class="{pxScreen} flex justify-between px-0 md:px-5">
      <div class="flex">
        <HeaderTab
          icon={faCalendarDays}
          label="Summary"
          active={$lastStatisticsTab$ === StatisticsTab.SUMMARY}
          title={$lastStatisticsTab$ === StatisticsTab.SUMMARY
            ? 'You are already on the Summary Tab'
            : 'Switch to Summary Tab'}
          onclick={() => ($lastStatisticsTab$ = StatisticsTab.SUMMARY)}
        />
        <HeaderTab
          icon={faMap}
          label="Heatmap"
          active={$lastStatisticsTab$ === StatisticsTab.OVERVIEW}
          title={$lastStatisticsTab$ === StatisticsTab.OVERVIEW
            ? 'You are already on the Heatmap Tab'
            : 'Switch to Heatmap Tab'}
          onclick={() => ($lastStatisticsTab$ = StatisticsTab.OVERVIEW)}
        />
        <div class={headerDividerClasses}></div>
        <HeaderIconButton
          icon={faFilter}
          title="Open Title Filter Menu"
          label="Filter"
          disabled={!$statisticsTitleFilterEnabled$}
          onclick={() => {
            if ($statisticsTitleFilterEnabled$) {
              $statisticsTitleFilterIsOpen$ = true;
            }
          }}
        />
        <HeaderIconButton
          icon={faSliders}
          title="Open Statistics Settings"
          label="Statistics Settings"
          onclick={() => (showStatisticsSettings = true)}
        />
      </div>
      <div class="flex">
        <div class="relative transform-gpu">
          <Popover
            placement="bottom"
            fallbackPlacements={['bottom-end', 'bottom-start']}
            yOffset={0}
            bind:this={copyStatisticsDataPopover}
          >
            {#snippet icon()}
              <div title="Copy Data in TMW Log Format" class={labelIconClasses}>
                <Fa icon={faCopy} class="text-sm xl:text-xs" />
                <span>Copy&nbsp;▾</span>
              </div>
            {/snippet}
            {#snippet content()}
              <div class="flex flex-col justify-center w-36 bg-gray-700">
                {#each copyStatisticsDataItems as copyStatisticsDataItem (copyStatisticsDataItem.key)}
                  <button
                    class="p-2 hover:bg-white hover:text-gray-700"
                    onclick={() => {
                      copyStatisticsData$.next(copyStatisticsDataItem.key);
                      copyStatisticsDataPopover?.toggleOpen();
                    }}
                  >
                    {copyStatisticsDataItem.label}
                  </button>
                {/each}
              </div>
            {/snippet}
          </Popover>
        </div>
        <div class={headerDividerClasses}></div>
        <HeaderNavTabs />
      </div>
    </div>
  </div>
</div>
