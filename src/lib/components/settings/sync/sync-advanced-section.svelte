<script lang="ts">
  import { onMount } from 'svelte';
  import { AutoReplicationType } from '$lib/functions/replication/replication-options';
  import {
    autoReplication$,
    cacheStorageData$,
    importHTMLFixMode$,
    readingGoalsMergeMode$,
    restrictImportFixToAnchor$,
    statisticsMergeMode$
  } from '$lib/data/store';
  import { ImportHTMLFixMode } from '$lib/data/import-html-fix-mode';
  import { syncState } from '$lib/data/sync/sync-store.svelte';
  import { storage } from '$lib/data/window/navigator/storage';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SettingsRadioItem from '$lib/components/settings/settings-radio-item.svelte';
  import SettingsSection from '$lib/components/settings/settings-section.svelte';
  import SettingsSwitchItem from '$lib/components/settings/settings-switch-item.svelte';
  import { describeSyncLocation } from '$lib/components/settings/sync/sync-utils';

  let hasLocation = $derived(syncState.location !== null);
  let locationLabel = $derived(describeSyncLocation(syncState.location) || 'your sync location');
  let advancedDescription = $derived(
    `Fine-tune how syncing works. Defaults are safe for most users.${
      hasLocation ? '' : ' These settings take effect once you connect a sync location above.'
    }`
  );

  let advancedOpen = $state(false);
  let storagePersistence = $state<boolean | 'checking' | 'unavailable'>('checking');
  let storageQuota = $state<string | null>(null);

  async function checkStorageStatus() {
    const [persistenceResult, estimateResult] = await Promise.allSettled([
      storage.persisted(),
      storage.estimate()
    ]);

    storagePersistence =
      persistenceResult.status === 'fulfilled' ? persistenceResult.value : 'unavailable';

    if (estimateResult.status === 'fulfilled') {
      const { usage, quota } = estimateResult.value;
      if (usage !== undefined && quota !== undefined && quota > 0) {
        storageQuota = `${Math.round(((usage / quota) * 100 + Number.EPSILON) * 100) / 100}% used`;
      }
    }
  }

  onMount(() => {
    if (window.location.hash === '#sync-direction') {
      advancedOpen = true;
    }

    void checkStorageStatus();
  });

  let importHTMLFixOptions = [
    {
      id: ImportHTMLFixMode.OFF,
      label: 'Off',
      description: 'Imports EPUB files as-is.',
      isDefault: true
    },
    {
      id: ImportHTMLFixMode.STANDARD,
      label: 'Standard',
      description:
        'Fixes common malformed-HTML issues during EPUB import, such as incorrect self-closing elements. This can help when a book looks broken in the reader.'
    },
    {
      id: ImportHTMLFixMode.EXTENDED,
      label: 'Extended',
      description:
        'Includes Standard fixes plus more aggressive cleanup of control characters and HTML entities. It is intended for books that remain broken after Standard.'
    }
  ];

  let directionOptions = $derived([
    {
      id: AutoReplicationType.All,
      label: 'Both',
      description: `Changes on this device are pushed to ${locationLabel}, and changes there are pulled down.`,
      isDefault: true
    },
    {
      id: AutoReplicationType.Up,
      label: 'Up only',
      description: `Pushes changes from this device to ${locationLabel}, but does not pull changes from there. This is useful if this device is the canonical source.`
    },
    {
      id: AutoReplicationType.Down,
      label: 'Down only',
      description: `Pulls changes from ${locationLabel}, but does not push. This is useful for read-only devices.`
    },
    {
      id: AutoReplicationType.Off,
      label: 'Off',
      description: 'Nothing is synced. Your library stays local until you turn this back on.'
    }
  ]);

  let statisticsMergeOptions = [
    {
      id: 'merge' as const,
      label: 'Merge',
      description:
        'Days that only exist on one side are kept. When the same day has statistics on both sides, the more recently updated entry wins.',
      isDefault: true
    },
    {
      id: 'replace' as const,
      label: 'Replace',
      description: `When sync copies statistics for a book, the receiving side's entire set for that book is replaced with the source side's set. Days that only existed on the receiving side are lost.`
    }
  ];

  let goalsMergeOptions = [
    {
      id: 'merge' as const,
      label: 'Merge',
      description:
        'Goals from both sides are combined. When the same goal exists on both sides, the more recently updated version wins.',
      isDefault: true
    },
    {
      id: 'replace' as const,
      label: 'Replace',
      description: `When sync copies goals, the receiving side's entire set of goals is replaced with the source side's set, including deletions.`
    }
  ];
</script>

<SettingsSection
  title="Advanced"
  description={advancedDescription}
  collapsible
  bind:open={advancedOpen}
>
  <SettingsRadioItem
    id="sync-direction"
    legend="Sync direction"
    options={directionOptions}
    bind:value={$autoReplication$}
  />

  <SettingsRadioItem
    legend="How to combine reading statistics"
    options={statisticsMergeOptions}
    bind:value={$statisticsMergeMode$}
  />

  <SettingsRadioItem
    legend="How to combine reading goals"
    options={goalsMergeOptions}
    bind:value={$readingGoalsMergeMode$}
  />

  <SettingsSwitchItem
    label="Cache remote file list"
    description="Remembers the remote file list for the rest of this session to save network traffic. Changes from other devices will not appear until you reload the page or open a new tab."
    bind:checked={$cacheStorageData$}
  />

  <SettingsRadioItem
    legend="EPUB import fixes"
    options={importHTMLFixOptions}
    bind:value={$importHTMLFixMode$}
  />

  {#if $importHTMLFixMode$ !== ImportHTMLFixMode.OFF}
    <SettingsSwitchItem
      label="Restrict self-closing-tag fixes to links"
      description="Fixes only anchor tags, leaving other elements as the EPUB had them. This can help when Standard or Extended over-corrects."
      bind:checked={$restrictImportFixToAnchor$}
      inset
    />
  {/if}

  <SettingsItem
    label={storageQuota ? `Local storage status · ${storageQuota}` : 'Local storage status'}
  >
    <div class="text-sm text-gray-700">
      {#if storagePersistence === 'checking'}
        Checking…
      {:else if storagePersistence === 'unavailable'}
        Unavailable. Your browser did not report whether this site's local data is durable.
      {:else if storagePersistence}
        Persistent. Your browser has marked this site's local data as durable — it won't be evicted
        under disk pressure.
      {:else}
        Temporary. Your browser may evict this site's local data if it runs low on disk. The reader
        re-asks for persistence on every sync; browsers grant it once you've used the site enough,
        bookmarked it, or installed it as a PWA.
      {/if}
    </div>
  </SettingsItem>
</SettingsSection>
