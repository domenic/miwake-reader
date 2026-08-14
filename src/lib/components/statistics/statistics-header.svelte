<script lang="ts">
  import type { ResolvedPathname } from '$app/types';
  import {
    faCalendarDays,
    faCopy,
    faEllipsis,
    faFilter,
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
  const copyMenuItems: HeaderMenuItem[] = copyStatisticsDataItems.map(({ key, label }) => ({
    label,
    onclick: () => oncopydata(key)
  }));

  const settingsAction: HeaderAction = {
    faIcon: faSliders,
    label: 'Statistics Settings',
    title: 'Open statistics settings',
    onclick: () => onopensettings()
  };

  let summarySelected = $derived(activeView === 'summary');
  let heatmapSelected = $derived(activeView === 'heatmap');
  const mobileMenuItems = [
    ...copyMenuItems.map(({ label, onclick }) => ({ label: `Copy ${label}`, onclick })),
    settingsAction
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
          <HeaderButton {...settingsAction} />
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
      </div>
      <div class="hidden md:flex">
        <HeaderMenuButton
          faIcon={faCopy}
          title="Copy data in TMW log format"
          label="Copy"
          items={copyMenuItems}
        />
        <div class={headerDividerClasses}></div>
        <HeaderNavTabs />
      </div>
    </div>
  </div>
</div>
