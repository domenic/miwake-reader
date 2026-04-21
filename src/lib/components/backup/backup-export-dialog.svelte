<script module lang="ts">
  import BackupExportDialog from '$lib/components/backup/backup-export-dialog.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
  import type {
    BackupCatalog as BackupCatalog_,
    BackupSelection as BackupSelection_
  } from '$lib/components/backup/backup-types';

  export function showBackupExportDialog(params: {
    catalog: BackupCatalog_;
    onExport: (selection: BackupSelection_) => Promise<void>;
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
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import {
    isEmptySelection,
    type BackupCatalog,
    type BackupSelection
  } from '$lib/components/backup/backup-types';

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

  async function submit() {
    if (isEmptySelection(selection)) return;
    exporting = true;
    errorMessage = null;
    try {
      await onExport(selection);
      // Close the dialog by submitting a form with value=done.
      const form = document.getElementById('backup-export-form') as HTMLFormElement | null;
      form?.requestSubmit();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
    } finally {
      exporting = false;
    }
  }
</script>

<div class="w-[560px] max-w-full">
  <header class="border-b border-black/10 pb-4">
    <h2 class="text-xl font-medium">Export backup</h2>
    <p class="mt-1 text-sm text-gray-600">
      Select what to include in the ZIP. Bookmarks and statistics can only be exported alongside
      their book.
    </p>
  </header>

  <div class="py-4">
    <BackupSelectionTree {catalog} {selection} onchange={(next) => (selection = next)} />
    {#if errorMessage}
      <div class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
        {errorMessage}
      </div>
    {/if}
  </div>

  <footer class="flex items-center justify-end gap-2 border-t border-black/10 pt-4">
    <form id="backup-export-form" method="dialog" class="m-0 flex gap-2">
      <SyncButton type="submit" value="cancel" disabled={exporting}>Cancel</SyncButton>
      <SyncButton
        type="button"
        variant="primary"
        disabled={exporting || isEmptySelection(selection)}
        onclick={submit}
      >
        {exporting ? 'Exporting…' : 'Export'}
      </SyncButton>
    </form>
  </footer>
</div>
