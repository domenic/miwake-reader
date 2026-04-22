<script lang="ts">
  import { goto } from '$app/navigation';
  import Fa from 'svelte-fa';
  import {
    faArrowsRotate,
    faCircleCheck,
    faCircleXmark,
    faCloudArrowUp,
    faTriangleExclamation,
    faWifi
  } from '@fortawesome/free-solid-svg-icons';
  import { pagePath } from '$lib/data/env';
  import {
    cloudConnection$,
    cloudHealth$,
    fsConnection$,
    fsHealth$
  } from '$lib/data/sync/sync-store';
  import { deriveIndicatorState } from '$lib/data/sync/sync-state';
  import { formatRelativeTime } from '$lib/components/settings/sync/sync-utils';
  import { isOnline$ } from '$lib/data/store';
  import { isSyncingOrPending } from '$lib/data/sync/sync-engine';

  // Poll the sync engine's in-flight state so the indicator reflects
  // an active push — isSyncingOrPending is imperative, not a store.
  let syncing = $state(false);
  $effect(() => {
    const interval = setInterval(() => {
      syncing = isSyncingOrPending();
    }, 500);
    return () => clearInterval(interval);
  });

  let indicator = $derived(
    deriveIndicatorState({
      cloud: $cloudConnection$,
      fs: $fsConnection$,
      cloudH: $cloudHealth$,
      fsH: $fsHealth$,
      online: $isOnline$,
      syncing
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

  const wrapperVariantClasses = {
    disabled: 'bg-gray-100 text-gray-500 hover:bg-gray-200',
    offline: 'bg-gray-100 text-gray-500',
    idle: 'bg-green-50 text-green-700',
    syncing: 'bg-blue-50 text-blue-700',
    'needs-attention': 'bg-amber-100 text-amber-800 hover:bg-amber-200',
    error: 'bg-red-100 text-red-800 hover:bg-red-200'
  };

  let label = $derived.by(() => {
    switch (indicator.kind) {
      case 'disabled':
        return 'Sync not configured';
      case 'offline':
        return "Offline — changes will sync when you're back online";
      case 'idle':
        return indicator.lastSyncedAt
          ? `Synced ${formatRelativeTime(indicator.lastSyncedAt)}`
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

  let clickable = $derived(
    indicator.kind === 'disabled' ||
      indicator.kind === 'needs-attention' ||
      indicator.kind === 'error' ||
      indicator.kind === 'idle'
  );

  let showLabel = $state(false);

  async function onClick() {
    if (!clickable) return;
    await goto(`${pagePath}/settings/sync`);
  }

  function onKey(e: KeyboardEvent) {
    if (!clickable) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  }

  // Hide the floating label after a few seconds of no hover.
  let labelTimeout: ReturnType<typeof setTimeout> | null = null;
  $effect(() => {
    if (showLabel) {
      if (labelTimeout) clearTimeout(labelTimeout);
      labelTimeout = setTimeout(() => {
        showLabel = false;
      }, 2500);
    }
    return () => {
      if (labelTimeout) clearTimeout(labelTimeout);
    };
  });
</script>

<div
  class="writing-horizontal-tb fixed bottom-3 left-3 z-40 flex items-center gap-2"
  onpointerenter={() => (showLabel = true)}
  onpointerleave={() => (showLabel = false)}
  role="presentation"
>
  <button
    type="button"
    aria-label={label}
    class:cursor-pointer={clickable}
    class:cursor-default={!clickable}
    class="flex h-9 w-9 items-center justify-center rounded-full shadow-sm ring-1 ring-black/10 transition-colors {wrapperVariantClasses[
      indicator.kind
    ]}"
    onclick={onClick}
    onkeydown={onKey}
    tabindex={clickable ? 0 : -1}
  >
    <Fa icon={icons[indicator.kind]} class={indicator.kind === 'syncing' ? 'animate-spin' : ''} />
  </button>
  {#if showLabel}
    <div
      class="rounded-md bg-[#333] px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-sm"
    >
      {label}
    </div>
  {/if}
</div>
