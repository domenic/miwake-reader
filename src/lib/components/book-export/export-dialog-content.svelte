<script module lang="ts">
  import ExportDialogContent from '$lib/components/book-export/export-dialog-content.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
  import type { StorageDataType } from '$lib/data/storage/storage-types';

  export function showExportDialog() {
    let result: StorageDataType[] | undefined;
    return showDialog<StorageDataType[] | undefined>(
      ExportDialogContent,
      { setResult: (v: StorageDataType[]) => (result = v) },
      {
        closedBy: 'any',
        resolveResult: (returnValue) => (returnValue === 'confirm' ? result : undefined)
      }
    );
  }
</script>

<script lang="ts">
  import ExportDataTypeCheckboxes from '$lib/components/book-export/export-data-type-checkboxes.svelte';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses, dialogActionsClasses, dialogTitleClasses } from '$lib/css-classes';
  import { lastExportedTypes$ } from '$lib/data/store';

  interface Props {
    setResult: (types: StorageDataType[]) => void;
  }

  let { setResult }: Props = $props();

  let dataToReplicate: StorageDataType[] = $state(lastExportedTypes$.getValue());
</script>

<h2 class={dialogTitleClasses}>Back Up to ZIP</h2>
<p class="mb-4">Choose the data to include in the ZIP file.</p>
<ExportDataTypeCheckboxes bind:dataToReplicate />
<form
  method="dialog"
  onsubmit={() => {
    lastExportedTypes$.next(dataToReplicate);
    setResult(dataToReplicate);
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
    type="submit">Back Up</button
  >
</form>
