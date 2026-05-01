<script lang="ts">
  import { onMount } from 'svelte';
  import { MergeMode } from '$lib/data/merge-mode';
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
  import { cloudConnection$, fsConnection$ } from '$lib/data/sync/sync-store';
  import { storage } from '$lib/data/window/navigator/storage';
  import Fa from 'svelte-fa';
  import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
  import SyncRadioGroup from '$lib/components/settings/sync/sync-radio-group.svelte';
  import { describeSyncLocations } from '$lib/components/settings/sync/sync-utils';

  let locations = $derived(describeSyncLocations($cloudConnection$, $fsConnection$));
  let hasLocation = $derived(locations.length > 0);
  let locationsOrFallback = $derived(hasLocation ? locations : 'your sync locations');

  let storagePersisted = $state<boolean | null>(null);
  let storageQuota = $state<string | null>(null);

  onMount(() => {
    storage.persisted().then((p) => {
      storagePersisted = p;
    });
    storage.estimate().then((est) => {
      if (est.usage !== undefined && est.quota !== undefined && est.quota > 0) {
        storageQuota = `${Math.round(((est.usage / est.quota) * 100 + Number.EPSILON) * 100) / 100}% used`;
      }
    });
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
        'Fixes common malformed-HTML issues during EPUB import (e.g. wrong self-closing elements). Try this if a book looks broken in the reader.'
    },
    {
      id: ImportHTMLFixMode.EXTENDED,
      label: 'Extended',
      description:
        'Standard fixes plus more aggressive cleanups (control characters, HTML entities). Use only if Standard didn’t fix it.'
    }
  ];

  let directionOptions = $derived([
    {
      id: AutoReplicationType.All,
      label: 'Both',
      description: `Changes on this device are pushed to ${locationsOrFallback}, and changes there are pulled down.`,
      isDefault: true
    },
    {
      id: AutoReplicationType.Up,
      label: 'Up only',
      description: `Push changes from this device to ${locationsOrFallback}, but don't pull changes from there. Useful if this device is the canonical source.`
    },
    {
      id: AutoReplicationType.Down,
      label: 'Down only',
      description: `Pull changes from ${locationsOrFallback}, but don't push. Useful for read-only devices.`
    },
    {
      id: AutoReplicationType.Off,
      label: 'Off',
      description: 'Nothing is synced. Your library stays local until you turn this back on.'
    }
  ]);

  let statisticsMergeOptions = [
    {
      id: MergeMode.MERGE,
      label: 'Merge',
      description:
        'Days that only exist on one side are kept. When the same day has statistics on both sides, the more recently updated entry wins.',
      isDefault: true
    },
    {
      id: MergeMode.REPLACE,
      label: 'Replace',
      description: `When sync copies statistics for a book, the receiving side's entire set for that book is replaced with the source side's set. Days that only existed on the receiving side are lost.`
    }
  ];

  let goalsMergeOptions = [
    {
      id: MergeMode.MERGE,
      label: 'Merge',
      description:
        'Goals from both sides are combined. When the same goal exists on both sides, the more recently updated version wins.',
      isDefault: true
    },
    {
      id: MergeMode.REPLACE,
      label: 'Replace',
      description: `When sync copies goals, the receiving side's entire set of goals is replaced with the source side's set, including deletions.`
    }
  ];
</script>

<details class="pb-8">
  <summary class="mb-2 flex cursor-pointer items-center gap-2 border-b border-black pb-1">
    <Fa icon={faChevronRight} class="chevron text-sm text-gray-500" />
    <h2 class="text-xl font-medium capitalize">Advanced</h2>
  </summary>
  <p class="mt-2 mb-4 text-sm text-gray-600">
    Fine-tune how syncing works. Defaults are safe for most users.
    {#if !hasLocation}
      These settings apply once you connect a sync location above.
    {/if}
  </p>

  <SyncRadioGroup
    heading="Sync direction"
    name="sync-direction"
    options={directionOptions}
    selected={$autoReplication$}
    onchange={(value) => ($autoReplication$ = value)}
  />

  <SyncRadioGroup
    heading="How to combine reading statistics"
    name="sync-statistics-merge"
    options={statisticsMergeOptions}
    selected={$statisticsMergeMode$}
    onchange={(value) => ($statisticsMergeMode$ = value)}
  />

  <SyncRadioGroup
    heading="How to combine reading goals"
    name="sync-goals-merge"
    options={goalsMergeOptions}
    selected={$readingGoalsMergeMode$}
    onchange={(value) => ($readingGoalsMergeMode$ = value)}
  />

  <div class="mt-5">
    <div class="mb-1 text-base font-medium">Cache remote file lists</div>
    <label class="flex items-start gap-3 rounded p-2 hover:bg-gray-400/15">
      <input type="checkbox" class="mt-1" bind:checked={$cacheStorageData$} />
      <div>
        <div class="font-medium">Cache remote file lists in memory</div>
        <div class="text-sm text-gray-600">
          When on, the app remembers the list of files at your sync locations for the rest of the
          session. This saves network traffic, but edits made from other devices won't appear until
          you reload the page or open a new tab. Off by default because the trade-off favors
          freshness for most users.
        </div>
      </div>
    </label>
  </div>

  <div class="mt-5">
    <div class="mb-1 text-base font-medium">Local storage</div>
    <div class="rounded p-2 text-sm text-gray-700">
      {#if storagePersisted === null}
        Checking…
      {:else if storagePersisted}
        Persistent. Your browser has marked this site's local data as durable — it won't be evicted
        under disk pressure.
      {:else}
        Temporary. Your browser may evict this site's local data if it runs low on disk. The reader
        re-asks for persistence on every sync; browsers grant it once you've used the site enough,
        bookmarked it, or installed it as a PWA.
      {/if}
      {#if storageQuota}
        <span class="text-gray-500"> · {storageQuota}</span>
      {/if}
    </div>
  </div>

  <SyncRadioGroup
    heading="EPUB import fixes"
    name="sync-import-html-fix"
    options={importHTMLFixOptions}
    selected={$importHTMLFixMode$}
    onchange={(value) => ($importHTMLFixMode$ = value)}
  />

  {#if $importHTMLFixMode$ !== ImportHTMLFixMode.OFF}
    <label class="ml-2 flex items-start gap-3 rounded p-2 hover:bg-gray-400/15">
      <input type="checkbox" class="mt-1" bind:checked={$restrictImportFixToAnchor$} />
      <div>
        <div class="font-medium">Restrict self-closing-tag fixes to links</div>
        <div class="text-sm text-gray-600">
          When on, the self-closing-element fix only touches anchor tags, leaving other elements as
          the EPUB had them. Useful if Standard / Extended is over-correcting.
        </div>
      </div>
    </label>
  {/if}
</details>

<style>
  summary::marker {
    content: '';
  }
  :global(.chevron) {
    transition: transform 150ms ease;
  }
  details[open] > summary :global(.chevron) {
    transform: rotate(90deg);
  }
</style>
