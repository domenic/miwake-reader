<script module lang="ts">
  import BackupImportDialog from '$lib/components/backup/backup-import-dialog.svelte';
  import { showDialog } from '$lib/components/dialog/show-dialog';
  import type {
    BackupCatalog,
    BackupImportDirection,
    BackupSelection
  } from '$lib/components/backup/backup-types';

  export function showBackupImportDialog(params: {
    fileName: string;
    catalog: BackupCatalog;
    onImport: (
      selection: BackupSelection,
      direction: BackupImportDirection
    ) => Promise<{
      books: number;
      bookmarks: number;
      statistics: number;
      readingGoals: boolean;
      appSettings: boolean;
    }>;
  }): Promise<void> {
    return showDialog<void>(
      BackupImportDialog,
      { fileName: params.fileName, catalog: params.catalog, onImport: params.onImport },
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
  import SyncRadioGroup from '$lib/components/settings/sync/sync-radio-group.svelte';
  import { isEmptySelection } from '$lib/components/backup/backup-types';
  import { untrack } from 'svelte';

  interface Props {
    fileName: string;
    catalog: BackupCatalog;
    onImport: (
      selection: BackupSelection,
      direction: BackupImportDirection
    ) => Promise<{
      books: number;
      bookmarks: number;
      statistics: number;
      readingGoals: boolean;
      appSettings: boolean;
    }>;
  }

  let { fileName, catalog, onImport }: Props = $props();

  type Stage =
    | { kind: 'select' }
    | { kind: 'importing' }
    | {
        kind: 'done';
        result: {
          books: number;
          bookmarks: number;
          statistics: number;
          readingGoals: boolean;
          appSettings: boolean;
        };
      };

  let stage = $state<Stage>({ kind: 'select' });
  let selection = $state<BackupSelection>(
    untrack(() => ({
      appSettings: catalog.hasAppSettings,
      readingGoals: catalog.hasReadingGoals,
      perBook: new Map(
        catalog.books.map((b) => [
          b.title,
          { book: true as const, bookmarks: b.hasBookmark, statistics: b.hasStatistics }
        ])
      )
    }))
  );
  let direction = $state<BackupImportDirection>('newest');
  let errorMessage = $state<string | null>(null);

  const directionOptions = [
    {
      id: 'newest' as const,
      label: 'Keep newest',
      description:
        'For each item, whichever side was modified most recently wins. If the ZIP is newer for a given item, it replaces your local copy; otherwise your local version is kept.',
      isDefault: true
    },
    {
      id: 'zip-wins' as const,
      label: 'ZIP wins',
      description:
        "Always take the backup's version, overwriting your local copy regardless of modification times. Any local edits newer than what's in the ZIP will be lost."
    }
  ];

  async function submit() {
    if (stage.kind !== 'select' || isEmptySelection(selection)) return;
    errorMessage = null;
    stage = { kind: 'importing' };
    try {
      const result = await onImport(selection, direction);
      stage = { kind: 'done', result };
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : String(err);
      stage = { kind: 'select' };
    }
  }
</script>

<DialogContentShell title="Import backup" description={`From ${fileName}`}>
  {#if stage.kind === 'select'}
    <div class="space-y-4">
      <BackupSelectionTree {catalog} {selection} onchange={(next) => (selection = next)} />
      <SyncRadioGroup
        heading="When the ZIP and this device disagree"
        name="backup-import-direction"
        options={directionOptions}
        selected={direction}
        onchange={(value) => (direction = value)}
      />
    </div>
    {#if errorMessage}
      <div class="mt-3 rounded-md bg-red-50 px-3 py-2 text-red-900">
        <div class="font-medium">Import failed</div>
        <div class="mt-0.5 text-xs">{errorMessage}</div>
      </div>
    {/if}
  {:else if stage.kind === 'importing'}
    <div class="py-10 text-center text-gray-600">Importing</div>
  {:else if stage.kind === 'done'}
    <div class="rounded-md bg-green-50 p-3 text-green-900">
      <div class="font-medium">Import complete.</div>
      <ul class="mt-1 list-inside list-disc text-xs">
        {#if stage.result.appSettings}<li>App settings imported.</li>{/if}
        {#if stage.result.readingGoals}<li>Reading goals imported.</li>{/if}
        {#if stage.result.books > 0}<li>{stage.result.books} book(s) imported.</li>{/if}
        {#if stage.result.bookmarks > 0}<li>
            {stage.result.bookmarks} bookmark(s) imported.
          </li>{/if}
        {#if stage.result.statistics > 0}<li>
            {stage.result.statistics} book statistic set(s) imported.
          </li>{/if}
      </ul>
    </div>
  {/if}

  {#snippet actions()}
    {#if stage.kind === 'select'}
      <DialogButton behavior="close">Cancel</DialogButton>
      <DialogButton behavior="action" disabled={isEmptySelection(selection)} onclick={submit}
        >Import</DialogButton
      >
    {:else if stage.kind === 'done'}
      <DialogButton behavior="submit">Close</DialogButton>
    {:else}
      <DialogButton behavior="close">Cancel</DialogButton>
    {/if}
  {/snippet}
</DialogContentShell>
