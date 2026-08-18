<script module lang="ts">
  import BackupExportDialog from '$lib/components/backup/backup-export-dialog.svelte';
  import { showDialog } from '$lib/components/dialog/show-dialog';
  import type { BackupCatalog, BackupSelection } from '$lib/components/backup/backup-types';

  export function showBackupExportDialog(params: {
    catalog: BackupCatalog;
    onExport: (selection: BackupSelection) => Promise<void>;
  }): Promise<void> {
    return showDialog<void>(
      BackupExportDialog,
      { catalog: params.catalog, onExport: params.onExport },
      {
        closedBy: 'closerequest',
        resolveResult: () => undefined
      }
    );
  }
</script>

<script lang="ts">
  import BackupSelectionTree from '$lib/components/backup/backup-selection-tree.svelte';
  import DialogButton from '$lib/components/dialog/dialog-button.svelte';
  import DialogContentShell from '$lib/components/dialog/dialog-content-shell.svelte';
  import { useDialogController } from '$lib/components/dialog/show-dialog';
  import { isEmptySelection } from '$lib/components/backup/backup-types';

  interface Props {
    catalog: BackupCatalog;
    onExport: (selection: BackupSelection) => Promise<void>;
  }

  let { catalog, onExport }: Props = $props();

  let selection = $state<BackupSelection>({
    appSettings: false,
    readingGoals: false,
    perBook: new Map()
  });

  let exporting = $state(false);
  let errorMessage = $state<string | null>(null);
  const dialogController = useDialogController();

  async function submit() {
    if (isEmptySelection(selection)) return;
    exporting = true;
    errorMessage = null;
    try {
      await onExport(selection);
      dialogController.close('done');
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      exporting = false;
    }
  }
</script>

<DialogContentShell
  title="Export backup"
  description="Select what to include in the ZIP. Bookmarks and statistics can only be exported alongside their book."
>
  <BackupSelectionTree {catalog} {selection} onchange={(next) => (selection = next)} />
  {#if errorMessage}
    <div class="mt-3 rounded-md bg-red-50 px-3 py-2 text-red-900">
      {errorMessage}
    </div>
  {/if}

  {#snippet actions()}
    <DialogButton behavior="close" disabled={exporting}>Cancel</DialogButton>
    <DialogButton
      behavior="action"
      disabled={exporting || isEmptySelection(selection)}
      onclick={submit}
    >
      {exporting ? 'Exporting' : 'Export'}
    </DialogButton>
  {/snippet}
</DialogContentShell>
