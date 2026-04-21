<script lang="ts">
  import { MergeMode } from '$lib/data/merge-mode';
  import {
    AutoReplicationType,
    ReplicationSaveBehavior
  } from '$lib/functions/replication/replication-options';
  import {
    cacheRemoteFileLists$,
    conflictBehavior$,
    readingGoalsMerge$,
    statisticsMerge$,
    syncDirection$
  } from '$lib/data/sync/sync-store';
  import SyncRadioGroup from '$lib/components/settings/sync/sync-radio-group.svelte';
  import SyncSection from '$lib/components/settings/sync/sync-section.svelte';

  const directionOptions = [
    {
      id: AutoReplicationType.All,
      label: 'Both',
      description:
        'Changes on this device are pushed to your backends, and changes from other devices are pulled down.',
      isDefault: true
    },
    {
      id: AutoReplicationType.Up,
      label: 'Up only',
      description:
        "Push changes from this device, but don't pull changes from others. Useful if this device is the canonical source."
    },
    {
      id: AutoReplicationType.Down,
      label: 'Down only',
      description: "Pull changes from other devices, but don't push. Useful for read-only devices."
    },
    {
      id: AutoReplicationType.Off,
      label: 'Off',
      description: 'Nothing is synced. Your library stays local until you turn this back on.'
    }
  ];

  const conflictOptions = [
    {
      id: ReplicationSaveBehavior.NewOnly,
      label: 'Keep newest',
      description: 'The more recently modified version wins. Safe for most users.',
      isDefault: true
    },
    {
      id: ReplicationSaveBehavior.Overwrite,
      label: 'Always overwrite',
      description:
        'The version being synced always replaces the target, regardless of modification time. Can lose changes if misused.'
    }
  ];

  const mergeOptions = (kind: 'statistics' | 'goals') => [
    {
      id: MergeMode.MERGE,
      label: 'Merge',
      description:
        kind === 'statistics'
          ? 'Reading time and character counts from multiple devices are added together per day.'
          : 'Goals from all devices are kept; if the same goal exists on multiple devices, the most recent version wins.',
      isDefault: true
    },
    {
      id: MergeMode.REPLACE,
      label: 'Replace',
      description:
        kind === 'statistics'
          ? "Only the most recently synced device's statistics are kept for each day."
          : 'The full set of goals from the incoming device replaces the local set, including deletions.'
    },
    {
      id: MergeMode.LOCAL,
      label: 'Keep local',
      description:
        kind === 'statistics'
          ? "Never overwrite this device's statistics with incoming data."
          : "Never overwrite this device's goals with incoming data."
    }
  ];
</script>

<SyncSection
  title="Advanced"
  description="Fine-tune how syncing works. Defaults are safe for most users."
>
  <div class="px-5 pb-4">
    <SyncRadioGroup
      heading="Sync direction"
      name="sync-direction"
      options={directionOptions}
      selected={$syncDirection$}
      onchange={(value) => syncDirection$.next(value)}
    />

    <SyncRadioGroup
      heading="Conflict behavior"
      subHeading="When the same book or data item has been changed on multiple devices:"
      name="sync-conflict"
      options={conflictOptions}
      selected={$conflictBehavior$}
      onchange={(value) => conflictBehavior$.next(value)}
    />

    <SyncRadioGroup
      heading="How to combine reading statistics"
      name="sync-statistics-merge"
      options={mergeOptions('statistics')}
      selected={$statisticsMerge$}
      onchange={(value) => statisticsMerge$.next(value)}
    />

    <SyncRadioGroup
      heading="How to combine reading goals"
      name="sync-goals-merge"
      options={mergeOptions('goals')}
      selected={$readingGoalsMerge$}
      onchange={(value) => readingGoalsMerge$.next(value)}
    />

    <div class="mt-4">
      <div class="text-sm font-medium text-black">Cache remote file lists</div>
      <label
        class="mt-1 flex cursor-pointer gap-3 rounded-md border border-transparent p-3 hover:bg-black/5"
      >
        <input
          type="checkbox"
          class="mt-0.5"
          checked={$cacheRemoteFileLists$ === 'on'}
          onchange={(e) =>
            cacheRemoteFileLists$.next(
              (e.currentTarget as HTMLInputElement).checked ? 'on' : 'off'
            )}
        />
        <div>
          <div class="text-sm font-medium text-black">Cache remote file lists in memory</div>
          <div class="text-xs text-gray-600">
            When on, the app remembers the list of files in your cloud account or local folder
            during a session, so it doesn't have to refetch it for every sync. Off by default
            because the trade-off favors freshness over traffic for most users.
          </div>
        </div>
      </label>
    </div>
  </div>
</SyncSection>
