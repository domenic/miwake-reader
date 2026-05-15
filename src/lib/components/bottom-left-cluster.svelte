<script lang="ts">
  // Bottom-left controls cluster — always shows the sync status pill;
  // in reader mode, stacks a play/pause and a stats-menu button above
  // it. The sync pill stays anchored at bottom-3 left-3 across every
  // route so users always know where to find it.
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Fa from 'svelte-fa';
  import {
    faArrowsRotate,
    faChartBar,
    faCircleCheck,
    faCircleXmark,
    faCloudArrowUp,
    faPause,
    faPlay,
    faTriangleExclamation,
    faWifi,
    type IconDefinition
  } from '@fortawesome/free-solid-svg-icons';
  import {
    isTrackerMenuOpen$,
    isTrackerPaused$,
    trackerAvailable$
  } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import Popover from '$lib/components/popover/popover.svelte';
  import { pagePath } from '$lib/data/env';
  import { isOnline$, statisticsEnabled$ } from '$lib/data/store';
  import { deriveIndicatorState } from '$lib/data/sync/sync-state';
  import { syncState } from '$lib/data/sync/sync-store.svelte';
  import { formatRelativeTimeLive } from '$lib/components/settings/sync/sync-utils';

  let indicator = $derived(
    deriveIndicatorState({
      location: syncState.location,
      health: syncState.health,
      online: $isOnline$,
      syncing: syncState.isSyncing
    })
  );

  const icons = {
    disabled: faCloudArrowUp,
    offline: faWifi,
    idle: faCircleCheck,
    syncing: faArrowsRotate,
    'needs-attention': faTriangleExclamation,
    error: faCircleXmark
  } as const;

  // Bare-icon styling — no surface, no ring, no shadow. State is
  // carried entirely in the icon color; hover gives a faint backdrop
  // for affordance. Matches the visual weight of the reader's other
  // chrome (footer text, header) so the cluster doesn't dominate.
  const wrapperVariantClasses = {
    disabled: 'text-gray-400',
    offline: 'text-gray-400',
    idle: 'text-emerald-500/80',
    syncing: 'text-sky-500',
    'needs-attention': 'text-amber-500',
    error: 'text-red-500'
  };

  let syncLabel = $derived.by(() => {
    switch (indicator.kind) {
      case 'disabled':
        return 'Sync not configured';
      case 'offline':
        return "Offline — changes will sync when you're back online";
      case 'idle':
        return indicator.lastSyncedAt
          ? `Synced ${formatRelativeTimeLive(indicator.lastSyncedAt)}`
          : 'Up to date';
      case 'syncing':
        return 'Syncing…';
      case 'needs-attention':
        return indicator.summary;
      case 'error':
        return indicator.summary;
      default:
        return '';
    }
  });

  let syncClickable = $derived(
    indicator.kind === 'disabled' ||
      indicator.kind === 'needs-attention' ||
      indicator.kind === 'error' ||
      indicator.kind === 'idle'
  );

  let isReaderRoute = $derived(
    page.url.pathname === `${pagePath}/b` || page.url.pathname.startsWith(`${pagePath}/b/`)
  );

  let showTrackerButtons = $derived(isReaderRoute && $statisticsEnabled$ && $trackerAvailable$);

  async function onSyncClick() {
    if (!syncClickable) return;
    await goto(`${pagePath}/settings/sync`);
  }

  function togglePause() {
    isTrackerPaused$.next(!$isTrackerPaused$);
  }

  function openTrackerMenu() {
    // /b owns the pause bookkeeping (wasTrackerPaused) — its
    // menu-open edge effect captures the prior state and pauses.
    // Mutating isTrackerPaused$ here would race that handler and
    // leave wasTrackerPaused stale on close.
    isTrackerMenuOpen$.set(true);
  }

  // 32px hit target, 16-18px icon. Hover dabs a faint translucent
  // backdrop in so users get a "this is interactive" affordance
  // without a permanent button surface.
  const buttonClass =
    'flex h-8 w-8 items-center justify-center rounded-full text-base sm:text-lg transition-colors hover:bg-black/5';
</script>

{#snippet clusterButton(
  label: string,
  icon: IconDefinition,
  opts: {
    onClick: () => void;
    clickable?: boolean;
    colorClass?: string;
    spin?: boolean;
  }
)}
  {@const clickable = opts.clickable ?? true}
  <Popover
    eventType="pointer"
    placement="right"
    fallbackPlacements={['top', 'bottom', 'left']}
    strategy="fixed"
    contentStyles="padding: 0.4rem 0.6rem; font-size: 0.75rem; font-weight: 500;"
  >
    {#snippet content()}{label}{/snippet}
    <button
      type="button"
      aria-label={label}
      class="{buttonClass} {opts.colorClass ?? ''}"
      class:cursor-pointer={clickable}
      class:cursor-default={!clickable}
      onclick={opts.onClick}
      tabindex={clickable ? 0 : -1}
    >
      <Fa {icon} class={opts.spin ? 'animate-spin' : ''} />
    </button>
  </Popover>
{/snippet}

<div class="writing-horizontal-tb fixed bottom-3 left-3 z-40 flex flex-col-reverse gap-2">
  {@render clusterButton(syncLabel, icons[indicator.kind], {
    onClick: onSyncClick,
    clickable: syncClickable,
    colorClass: wrapperVariantClasses[indicator.kind],
    spin: indicator.kind === 'syncing'
  })}

  {#if showTrackerButtons}
    {@render clusterButton(
      $isTrackerPaused$ ? 'Resume reading tracker' : 'Pause reading tracker',
      $isTrackerPaused$ ? faPlay : faPause,
      { onClick: togglePause, colorClass: 'text-gray-600' }
    )}
    {@render clusterButton('Open reading statistics', faChartBar, {
      onClick: openTrackerMenu,
      colorClass: 'text-gray-600'
    })}
  {/if}
</div>
