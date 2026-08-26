<script lang="ts">
  import type { ResolvedPathname } from '$app/types';
  import {
    faCalendarDays,
    faCopy,
    faEllipsis,
    faFilter,
    faFlag,
    faMap,
    faSliders
  } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton, { type HeaderAction } from '$lib/components/header-button.svelte';
  import HeaderMenuButton, { type HeaderMenuItem } from '$lib/components/header-menu-button.svelte';
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
    onopenviewoptions: () => void;
    summaryHref: ResolvedPathname;
    heatmapHref: ResolvedPathname;
    goalsHref: ResolvedPathname;
  }

  let {
    activeView,
    titleFilterEnabled,
    oncopydata,
    onopenfilter,
    onopenviewoptions,
    summaryHref,
    heatmapHref,
    goalsHref
  }: Props = $props();

  const copyStatisticsDataItems: StatisticsDataSource[] = [
    { key: 'readingTime', label: 'Reading Time' },
    { key: 'charactersRead', label: 'Characters Read' }
  ];
  const copyMenuItems: HeaderMenuItem[] = copyStatisticsDataItems.map(({ key, label }) => ({
    label,
    onclick: () => oncopydata(key)
  }));

  const viewOptionsAction: HeaderAction = {
    faIcon: faSliders,
    label: 'View Options',
    title: 'Open view options',
    onclick: () => onopenviewoptions()
  };

  let summarySelected = $derived(activeView === 'summary');
  let heatmapSelected = $derived(activeView === 'heatmap');
  let goalsSelected = $derived(activeView === 'goals');
  let showStatisticsActions = $derived(activeView !== 'goals');
  const mobileMenuItems = [
    ...copyMenuItems.map(({ label, onclick }) => ({ label: `Copy ${label}`, onclick })),
    viewOptionsAction
  ];
</script>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <div class={baseHeaderClasses} role="toolbar" aria-label="Statistics controls">
    <div
      data-mobile-actions
      class="grid h-full grid-flow-col auto-cols-fr md:flex md:justify-between"
    >
      <div class="contents md:flex" data-sveltekit-keepfocus data-sveltekit-noscroll>
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
        <HeaderButton
          faIcon={faFlag}
          label="Goals"
          selected={goalsSelected}
          variant="tab"
          title={goalsSelected ? undefined : 'Switch to Goals tab'}
          href={goalsHref}
        />
        {#if showStatisticsActions}
          <div class="hidden md:block {headerDividerClasses}"></div>
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
          <div class="hidden md:contents">
            <HeaderButton {...viewOptionsAction} />
          </div>
          <div class="contents md:hidden">
            <HeaderMenuButton
              faIcon={faEllipsis}
              title="More statistics actions"
              label="More"
              fill
              items={mobileMenuItems}
            />
          </div>
        {/if}
      </div>
      <div class="hidden md:flex">
        {#if showStatisticsActions}
          <HeaderMenuButton
            faIcon={faCopy}
            title="Copy data in TMW log format"
            label="Copy"
            items={copyMenuItems}
          />
          <div class={headerDividerClasses}></div>
        {/if}
        <HeaderNavTabs />
      </div>
    </div>
  </div>
</div>
