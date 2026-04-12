<script module lang="ts">
  import SyncDialogContent from '$lib/components/book-export/sync-dialog-content.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
  import { StorageKey, type StorageDataType } from '$lib/data/storage/storage-types';

  export function showSyncDialog() {
    let result: { target: StorageKey; types: StorageDataType[] } | undefined;
    return showDialog<typeof result>(
      SyncDialogContent,
      {
        setResult: (v: { target: StorageKey; types: StorageDataType[] }) => (result = v)
      },
      {
        closedBy: 'any',
        resolveResult: (returnValue) => (returnValue === 'confirm' ? result : undefined)
      }
    );
  }
</script>

<script lang="ts">
  import { browser } from '$app/environment';
  import ButtonToggleGroup from '$lib/components/button-toggle-group/button-toggle-group.svelte';
  import type { ToggleOption } from '$lib/components/button-toggle-group/toggle-option';
  import ExportDataTypeCheckboxes from '$lib/components/book-export/export-data-type-checkboxes.svelte';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses, dialogActionsClasses, dialogTitleClasses } from '$lib/css-classes';
  import {
    getStorageSourceValue,
    isStorageSourceAvailable,
    storageSource$,
    storageSourceLabels
  } from '$lib/data/storage/storage-view';
  import { isOnline$, lastExportedTarget$, lastExportedTypes$ } from '$lib/data/store';
  import { isOnlineSourceAvailable } from '$lib/functions/utils';

  interface Props {
    setResult: (value: { target: StorageKey; types: StorageDataType[] }) => void;
  }

  let { setResult }: Props = $props();

  const currentSource = storageSource$.getValue();
  const currentSourceLabel = storageSourceLabels[currentSource];

  const allTargetOptions: ToggleOption<StorageKey>[] = [];
  if (browser) {
    for (const key of [StorageKey.BROWSER, StorageKey.GDRIVE, StorageKey.ONEDRIVE, StorageKey.FS]) {
      if (
        key !== currentSource &&
        isStorageSourceAvailable(key, getStorageSourceValue(key), window)
      ) {
        allTargetOptions.push({ id: key, text: storageSourceLabels[key] });
      }
    }
  }

  let targetOptions = $derived(
    allTargetOptions.filter((t) => isOnlineSourceAvailable($isOnline$, t.id))
  );

  const lastTarget = lastExportedTarget$.getValue();
  let target = $state(
    allTargetOptions.find((t) => t.id === lastTarget) ? lastTarget : allTargetOptions[0]?.id
  );

  // Keep target valid if online status changes and filters out the current selection
  $effect(() => {
    if (targetOptions.length > 0 && !targetOptions.find((t) => t.id === target)) {
      target = targetOptions[0].id;
    }
  });
  let dataToReplicate: StorageDataType[] = $state(lastExportedTypes$.getValue());
</script>

<h2 class={dialogTitleClasses}>Sync Data</h2>
{#if targetOptions.length === 1}
  <p class="mb-4">
    Perform a one-time copy of the selected data from {currentSourceLabel} to {targetOptions[0]
      .text}.
  </p>
{:else}
  <p class="mb-4">
    Perform a one-time copy of the selected data from {currentSourceLabel} to another storage source.
  </p>
  <h3 class="mb-2 font-medium">Target</h3>
  <div class="mb-4">
    <ButtonToggleGroup options={targetOptions} bind:selectedOptionId={target} />
  </div>
{/if}
<h3 class="mb-2 font-medium">Data</h3>
<ExportDataTypeCheckboxes bind:dataToReplicate />
<form
  method="dialog"
  onsubmit={() => {
    lastExportedTarget$.next(target);
    lastExportedTypes$.next(dataToReplicate);
    setResult({ target, types: dataToReplicate });
  }}
  class={dialogActionsClasses}
>
  <button use:ripple class={buttonClasses} value="cancel" type="submit">Cancel</button>
  <button
    use:ripple
    class={buttonClasses}
    class:cursor-not-allowed={!dataToReplicate.length}
    disabled={!dataToReplicate.length}
    value="confirm"
    type="submit">Start</button
  >
</form>
