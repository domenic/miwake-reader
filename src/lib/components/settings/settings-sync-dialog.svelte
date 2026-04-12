<script lang="ts">
  import { faArrowsUpDown } from '@fortawesome/free-solid-svg-icons';
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import { ripple } from '$lib/components/ripple';
  import { baseIconClasses, buttonClasses } from '$lib/css-classes';
  import { InternalStorageSources, StorageKey } from '$lib/data/storage/storage-types';
  import { storageSourceLabels } from '$lib/data/storage/storage-view';
  import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
  import type { SyncSelection } from '$lib/data/dialog-manager';
  import { lastSyncedSettingsSource$, lastSyncedSettingsTarget$ } from '$lib/data/store';
  import { dummyFn } from '$lib/functions/utils';
  import Fa from 'svelte-fa';
  import { untrack } from 'svelte';

  interface Props {
    settingsSyncHeader?: string;
    storageSources?: BooksDbStorageSource[];
    resolver: (arg0: SyncSelection[]) => void;
    onclose?: () => void;
  }

  let { settingsSyncHeader = '', storageSources = [], resolver, onclose }: Props = $props();

  const syncSources: SyncSelection[] = [
    {
      id: InternalStorageSources.INTERNAL_BROWSER,
      label: storageSourceLabels[StorageKey.BROWSER],
      type: StorageKey.BROWSER
    },
    { id: InternalStorageSources.INTERNAL_ZIP, label: 'ZIP File', type: StorageKey.BACKUP },
    ...untrack(() => storageSources).map((storageSource) => ({
      id: storageSource.name,
      label: `${storageSource.name} (${storageSource.type})`,
      type: storageSource.type
    }))
  ];

  let selectedSource = $state(
    syncSources.find((entry) => entry.id === $lastSyncedSettingsSource$)?.id || syncSources[0].id
  );
  let selectedTarget = $state(
    syncSources.find((entry) => entry.id === $lastSyncedSettingsTarget$)?.id || syncSources[1].id
  );

  let sources = $derived(
    syncSources.filter(
      (entry) => entry.id !== selectedTarget && entry.id !== InternalStorageSources.INTERNAL_ZIP
    )
  );
  let targets = $derived(syncSources.filter((entry) => entry.id !== selectedSource));

  function closeDialog(wasCanceled = false) {
    if (!wasCanceled) {
      $lastSyncedSettingsSource$ = selectedSource;
      $lastSyncedSettingsTarget$ = selectedTarget;
    }

    resolver(
      wasCanceled
        ? []
        : [
            syncSources.find((entry) => entry.id === selectedSource)!,
            syncSources.find((entry) => entry.id === selectedTarget)!
          ]
    );
    onclose?.();
  }
</script>

<DialogTemplate>
  {#snippet header()}
    {settingsSyncHeader}
  {/snippet}
  {#snippet content()}
    <div class="flex flex-col">
      <div>Source</div>
      <select bind:value={selectedSource}>
        {#each sources as source (source.id)}
          <option value={source.id}>
            {source.label}
          </option>
        {/each}
      </select>
      <div
        tabindex="0"
        role="button"
        title={selectedTarget === InternalStorageSources.INTERNAL_ZIP
          ? 'Choose a different Target for swap'
          : 'Click to swap Source and Target'}
        class="transform-gpu {baseIconClasses} flex justify-center"
        style="width: 100%;"
        style:cursor={selectedTarget === InternalStorageSources.INTERNAL_ZIP
          ? 'not-allowed'
          : 'pointer'}
        onclick={() => {
          if (selectedTarget === InternalStorageSources.INTERNAL_ZIP) {
            return;
          }

          const oldSource = selectedSource;
          const oldTarget = selectedTarget;

          selectedSource = oldTarget;
          selectedTarget = oldSource;
        }}
        onkeyup={dummyFn}
      >
        <Fa icon={faArrowsUpDown} />
      </div>
      <div>Target</div>
      <select bind:value={selectedTarget}>
        {#each targets as target (target.id)}
          <option value={target.id}>
            {target.label}
          </option>
        {/each}
      </select>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex grow justify-between">
      <button use:ripple class={buttonClasses} onclick={() => closeDialog(true)}>Cancel</button>
      <button use:ripple class={buttonClasses} onclick={() => closeDialog()}>Confirm</button>
    </div>
  {/snippet}
</DialogTemplate>
