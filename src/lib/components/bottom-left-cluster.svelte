<script lang="ts">
  // Bottom-left controls cluster — always shows the sync status pill;
  // in reader mode, stacks a play/pause and a stats-menu button above
  // it. The sync pill stays anchored in the lower-left corner across every route so users always know where to find it.
  import { resolve } from '$app/paths';
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
    openTrackerMenu,
    toggleTrackerPauseByUser,
    trackerStatus
  } from '$lib/components/book-reader/book-reading-tracker/tracker-state.svelte';
  import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import { autoReplication$, statisticsEnabled$ } from '$lib/data/store';
  import { connectCloud } from '$lib/data/sync/source-manager';
  import { retryAfterReconnect } from '$lib/data/sync/sync-engine';
  import { deriveIndicatorState } from '$lib/data/sync/sync-state';
  import { syncState } from '$lib/data/sync/sync-store.svelte';
  import { formatRelativeTimeLive } from '$lib/components/settings/sync/sync-utils';
  import { online } from 'svelte/reactivity/window';

  let reconnecting = $state(false);

  let indicator = $derived(
    deriveIndicatorState({
      location: syncState.location,
      health: syncState.health,
      online: online.current !== false,
      direction: $autoReplication$,
      pending: syncState.isSyncPending,
      syncing: syncState.isSyncing
    })
  );

  const icons = {
    disabled: faCloudArrowUp,
    off: faCloudArrowUp,
    offline: faWifi,
    idle: faCircleCheck,
    pending: faCloudArrowUp,
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
    off: 'text-gray-500',
    offline: 'text-gray-400',
    idle: 'text-emerald-500/80',
    pending: 'text-sky-500/80',
    syncing: 'text-sky-500',
    'needs-attention': 'text-amber-500',
    error: 'text-red-500'
  };

  let syncLabel = $derived.by(() => {
    switch (indicator.kind) {
      case 'disabled':
        return 'Sync not configured';
      case 'off':
        return 'Sync is off';
      case 'offline':
        return "Offline — changes will sync when you're back online";
      case 'idle':
        return indicator.lastSyncedAt
          ? `Synced ${formatRelativeTimeLive(indicator.lastSyncedAt)}`
          : 'Up to date';
      case 'pending':
        return 'Sync pending…';
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
    !reconnecting &&
      (indicator.kind === 'disabled' ||
        indicator.kind === 'off' ||
        indicator.kind === 'needs-attention' ||
        indicator.kind === 'error' ||
        indicator.kind === 'idle')
  );

  let isReaderRoute = $derived(page.route.id === '/b');

  let showTrackerButtons = $derived(
    isReaderRoute && $statisticsEnabled$ && trackerStatus.available
  );

  function isPlainPrimaryClick(event: MouseEvent) {
    return (
      event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey
    );
  }

  async function onSyncClick(event: MouseEvent) {
    const location = syncState.location;
    if (
      isPlainPrimaryClick(event) &&
      syncState.health.status === 'reauth-required' &&
      location?.kind === 'cloud'
    ) {
      event.preventDefault();
      reconnecting = true;
      try {
        await connectCloud(location.provider, {
          useCustomCredentials: location.usesCustomCredentials
        });
        await retryAfterReconnect();
      } catch (err) {
        await showErrorDialog({ title: 'Error reconnecting to sync location', error: err });
      } finally {
        reconnecting = false;
      }
    }
  }

  // The hit target size comes from the shared sync-indicator CSS variables.
  // Hover dabs a faint translucent backdrop in so users get a "this is interactive" affordance without a permanent button surface.
  const buttonClass =
    'sync-indicator-size flex items-center justify-center rounded-full text-base transition-colors hover:bg-black/5 sm:text-lg';
</script>

{#snippet actionButton(label: string, icon: IconDefinition, onClick: (event: MouseEvent) => void)}
  <button
    type="button"
    title={label}
    class="{buttonClass} cursor-pointer text-gray-600"
    onclick={onClick}
  >
    <Fa {icon} />
  </button>
{/snippet}

<!-- TODO: Revisit these tooltips with `interestfor` and `popover="hint"` once supported by our target browsers. -->
<div class="sync-indicator-inset writing-horizontal-tb fixed z-40 flex flex-col-reverse gap-2">
  {#if syncClickable}
    <a
      title={syncLabel}
      class="{buttonClass} {wrapperVariantClasses[indicator.kind]} cursor-pointer"
      href={resolve(indicator.kind === 'off' ? '/settings/sync#sync-direction' : '/settings/sync')}
      onclick={onSyncClick}
    >
      <Fa icon={icons[indicator.kind]} />
    </a>
  {:else}
    <button
      type="button"
      title={syncLabel}
      class="{buttonClass} {wrapperVariantClasses[indicator.kind]} cursor-default"
      tabindex={-1}
    >
      <Fa icon={icons[indicator.kind]} class={indicator.kind === 'syncing' ? 'animate-spin' : ''} />
    </button>
  {/if}

  {#if showTrackerButtons}
    {@render actionButton(
      trackerStatus.paused ? 'Resume reading tracker' : 'Pause reading tracker',
      trackerStatus.paused ? faPlay : faPause,
      toggleTrackerPauseByUser
    )}
    {@render actionButton('Open reading statistics', faChartBar, openTrackerMenu)}
  {/if}
</div>
