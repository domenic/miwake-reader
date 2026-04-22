<script lang="ts">
  import { MergeMode } from '$lib/data/merge-mode';
  import { AutoReplicationType } from '$lib/functions/replication/replication-options';
  import {
    cacheRemoteFileLists$,
    cloudConnection$,
    fsConnection$,
    readingGoalsMerge$,
    statisticsMerge$,
    syncDirection$
  } from '$lib/data/sync/sync-store';
  import Fa from 'svelte-fa';
  import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
  import SyncRadioGroup from '$lib/components/settings/sync/sync-radio-group.svelte';
  import { describeSyncLocations } from '$lib/components/settings/sync/sync-utils';

  let locations = $derived(describeSyncLocations($cloudConnection$, $fsConnection$));
  let hasLocation = $derived(locations.length > 0);
  let locationsOrFallback = $derived(hasLocation ? locations : 'your sync locations');

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

  let statisticsMergeOptions = $derived([
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
    },
    {
      id: MergeMode.LOCAL,
      label: 'Keep local',
      description: `Leave this device's statistics unchanged during sync, even if the data at ${locationsOrFallback} is newer. Outgoing sync still pushes this device's statistics out, replacing whatever is there.`
    }
  ]);

  let goalsMergeOptions = $derived([
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
    },
    {
      id: MergeMode.LOCAL,
      label: 'Keep local',
      description: `Leave this device's goals unchanged during sync, even if the data at ${locationsOrFallback} is newer. Outgoing sync still pushes this device's goals out, replacing whatever is there.`
    }
  ]);
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
    selected={$syncDirection$}
    onchange={(value) => syncDirection$.next(value)}
  />

  <SyncRadioGroup
    heading="How to combine reading statistics"
    name="sync-statistics-merge"
    options={statisticsMergeOptions}
    selected={$statisticsMerge$}
    onchange={(value) => statisticsMerge$.next(value)}
  />

  <SyncRadioGroup
    heading="How to combine reading goals"
    name="sync-goals-merge"
    options={goalsMergeOptions}
    selected={$readingGoalsMerge$}
    onchange={(value) => readingGoalsMerge$.next(value)}
  />

  <div class="mt-5">
    <div class="mb-1 text-base font-medium">Cache remote file lists</div>
    <label class="flex cursor-pointer items-start gap-3 rounded p-2 hover:bg-gray-400/15">
      <input
        type="checkbox"
        class="mt-1"
        checked={$cacheRemoteFileLists$ === 'on'}
        onchange={(e) =>
          cacheRemoteFileLists$.next((e.currentTarget as HTMLInputElement).checked ? 'on' : 'off')}
      />
      <div>
        <div class="font-medium">Cache remote file lists in memory</div>
        <div class="text-sm text-gray-600">
          When on, the app remembers the list of files at your sync locations during a session, so
          it doesn't have to refetch it for every sync. Off by default because the trade-off favors
          freshness over traffic for most users.
        </div>
      </div>
    </label>
  </div>
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
