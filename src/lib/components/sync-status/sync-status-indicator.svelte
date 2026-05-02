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
    faWifi
  } from '@fortawesome/free-solid-svg-icons';
  import {
    isTrackerMenuOpen$,
    isTrackerPaused$,
    trackerAvailable$
  } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import { pagePath } from '$lib/data/env';
  import { isOnline$, statisticsEnabled$ } from '$lib/data/store';
  import { deriveIndicatorState } from '$lib/data/sync/sync-state';
  import {
    cloudConnection$,
    cloudHealth$,
    fsConnection$,
    fsHealth$,
    isSyncing$,
    now$
  } from '$lib/data/sync/sync-store';
  import { formatRelativeTime } from '$lib/components/settings/sync/sync-utils';

  let indicator = $derived(
    deriveIndicatorState({
      cloud: $cloudConnection$,
      fs: $fsConnection$,
      cloudH: $cloudHealth$,
      fsH: $fsHealth$,
      online: $isOnline$,
      syncing: $isSyncing$
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

  // Muted palette: a single light-translucent surface across every
  // state so the cluster fades into the reader's chrome; state is
  // carried in the icon color (and a colored ring for user-actionable
  // attention/error states so they still pull the eye).
  const wrapperVariantClasses = {
    disabled: 'text-gray-400 hover:bg-white',
    offline: 'text-gray-400',
    idle: 'text-emerald-600',
    syncing: 'text-sky-600',
    'needs-attention': 'text-amber-600 ring-amber-400/70 hover:bg-amber-50',
    error: 'text-red-600 ring-red-400/70 hover:bg-red-50'
  };

  let syncLabel = $derived.by(() => {
    switch (indicator.kind) {
      case 'disabled':
        return 'Sync not configured';
      case 'offline':
        return "Offline — changes will sync when you're back online";
      case 'idle':
        return indicator.lastSyncedAt
          ? `Synced ${formatRelativeTime(indicator.lastSyncedAt, $now$)}`
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

  function onSyncKey(e: KeyboardEvent) {
    if (!syncClickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSyncClick();
    }
  }

  function togglePause() {
    isTrackerPaused$.next(!$isTrackerPaused$);
  }

  function openTrackerMenu() {
    // Match the pre-split behavior: pausing while the menu is open
    // freezes statistics so the user can review without the timer
    // ticking.
    isTrackerPaused$.next(true);
    isTrackerMenuOpen$.set(true);
  }

  // Per-button hover state. A shared timer hides the floating label
  // after a few seconds of no hover, matching the prior sync-only
  // behavior.
  let hovered = $state<'sync' | 'pause' | 'menu' | null>(null);
  let labelTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (hovered) {
      if (labelTimeout) clearTimeout(labelTimeout);
      labelTimeout = setTimeout(() => {
        hovered = null;
      }, 2500);
    }
    return () => {
      if (labelTimeout) clearTimeout(labelTimeout);
    };
  });

  const buttonClass =
    'flex h-9 w-9 items-center justify-center rounded-full bg-white/80 backdrop-blur-sm shadow-sm ring-1 ring-black/10 transition-colors';
  const trackerButtonClass = `${buttonClass} text-gray-700 hover:bg-white cursor-pointer`;
  const tooltipClass =
    'rounded-md bg-[#333]/90 backdrop-blur-sm px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-sm';
</script>

<div class="writing-horizontal-tb fixed bottom-3 left-3 z-40 flex flex-col-reverse gap-2">
  <div
    class="flex items-center gap-2"
    onpointerenter={() => (hovered = 'sync')}
    onpointerleave={() => (hovered = null)}
    role="presentation"
  >
    <button
      type="button"
      aria-label={syncLabel}
      class:cursor-pointer={syncClickable}
      class:cursor-default={!syncClickable}
      class="{buttonClass} {wrapperVariantClasses[indicator.kind]}"
      onclick={onSyncClick}
      onkeydown={onSyncKey}
      tabindex={syncClickable ? 0 : -1}
    >
      <Fa icon={icons[indicator.kind]} class={indicator.kind === 'syncing' ? 'animate-spin' : ''} />
    </button>
    {#if hovered === 'sync'}
      <div class={tooltipClass}>{syncLabel}</div>
    {/if}
  </div>

  {#if showTrackerButtons}
    <div
      class="flex items-center gap-2"
      onpointerenter={() => (hovered = 'pause')}
      onpointerleave={() => (hovered = null)}
      role="presentation"
    >
      <button
        type="button"
        aria-label={$isTrackerPaused$ ? 'Resume reading tracker' : 'Pause reading tracker'}
        class={trackerButtonClass}
        onclick={togglePause}
      >
        <Fa icon={$isTrackerPaused$ ? faPlay : faPause} />
      </button>
      {#if hovered === 'pause'}
        <div class={tooltipClass}>
          {$isTrackerPaused$ ? 'Resume reading tracker' : 'Pause reading tracker'}
        </div>
      {/if}
    </div>

    <div
      class="flex items-center gap-2"
      onpointerenter={() => (hovered = 'menu')}
      onpointerleave={() => (hovered = null)}
      role="presentation"
    >
      <button
        type="button"
        aria-label="Open reading statistics"
        class={trackerButtonClass}
        onclick={openTrackerMenu}
      >
        <Fa icon={faChartBar} />
      </button>
      {#if hovered === 'menu'}
        <div class={tooltipClass}>Open reading statistics</div>
      {/if}
    </div>
  {/if}
</div>
