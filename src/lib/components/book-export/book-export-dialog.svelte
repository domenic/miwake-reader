<script lang="ts">
  import { browser } from '$app/environment';
  import BookExportSelection from '$lib/components/book-export/book-export-selection.svelte';
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import { StorageKey } from '$lib/data/storage/storage-types';
  import {
    getStorageIconData,
    isStorageSourceAvailable,
    storageSource$
  } from '$lib/data/storage/storage-view';
  import {
    fsStorageSource$,
    gDriveStorageSource$,
    lastExportedTarget$,
    lastExportedTypes$,
    oneDriveStorageSource$
  } from '$lib/data/store';
  import { executeReplicate$ } from '$lib/functions/replication/replication-progress';

  interface Props {
    onclose?: () => void;
  }

  let { onclose }: Props = $props();

  const baseIcons = [
    { ...getStorageIconData(StorageKey.BACKUP), source: StorageKey.BACKUP, label: 'Zip File' },
    { ...getStorageIconData(StorageKey.BROWSER), source: StorageKey.BROWSER, label: 'Browser DB' }
  ];

  let icons = $derived.by(() => {
    if (!browser) return baseIcons;

    return [
      ...baseIcons,
      ...(isStorageSourceAvailable(StorageKey.GDRIVE, $gDriveStorageSource$, window)
        ? [{ ...getStorageIconData(StorageKey.GDRIVE), source: StorageKey.GDRIVE, label: 'GDrive' }]
        : []),
      ...(isStorageSourceAvailable(StorageKey.ONEDRIVE, $oneDriveStorageSource$, window)
        ? [
            {
              ...getStorageIconData(StorageKey.ONEDRIVE),
              source: StorageKey.ONEDRIVE,
              label: 'OneDrive'
            }
          ]
        : []),
      ...(isStorageSourceAvailable(StorageKey.FS, $fsStorageSource$, window)
        ? [{ ...getStorageIconData(StorageKey.FS), source: StorageKey.FS, label: 'Filesystem' }]
        : [])
    ].filter((icon) => icon.source !== $storageSource$);
  });

  function replicateData() {
    executeReplicate$.next();

    onclose?.();
  }
</script>

<DialogTemplate>
  {#snippet content()}
    <BookExportSelection
      {icons}
      bind:target={$lastExportedTarget$}
      bind:dataToReplicate={$lastExportedTypes$}
    />
  {/snippet}
  {#snippet footer()}
    <div class="flex grow justify-between">
      <button class={buttonClasses} onclick={() => onclose?.()} use:ripple>Cancel</button>
      <button
        class={buttonClasses}
        class:cursor-not-allowed={!$lastExportedTypes$.length}
        disabled={!$lastExportedTypes$.length}
        onclick={replicateData}
        use:ripple
      >
        Start
      </button>
    </div>
  {/snippet}
</DialogTemplate>
