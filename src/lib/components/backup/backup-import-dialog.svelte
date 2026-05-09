<script module lang="ts">
  import BackupImportDialog from '$lib/components/backup/backup-import-dialog.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
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
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
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
          b.id,
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

<div class="w-[560px] max-w-full">
  <header class="border-b border-black/10 pb-4">
    <h2 class="text-xl font-medium">Import backup</h2>
    <p class="mt-1 text-sm text-gray-600">
      From <span class="font-mono">{fileName}</span>
    </p>
  </header>

  <div class="py-4">
    {#if stage.kind === 'select'}
      <BackupSelectionTree {catalog} {selection} onchange={(next) => (selection = next)} />
      <SyncRadioGroup
        heading="When the ZIP and this device disagree"
        name="backup-import-direction"
        options={directionOptions}
        selected={direction}
        onchange={(value) => (direction = value)}
      />
      {#if errorMessage}
        <div class="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          <div class="font-medium">Import failed</div>
          <div class="mt-0.5 text-xs">{errorMessage}</div>
        </div>
      {/if}
    {:else if stage.kind === 'importing'}
      <div class="py-10 text-center text-sm text-gray-600">Importing</div>
    {:else if stage.kind === 'done'}
      <div class="rounded-md bg-green-50 px-3 py-3 text-sm text-green-900">
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
  </div>

  <footer class="flex items-center justify-end gap-2 border-t border-black/10 pt-4">
    <form method="dialog" class="m-0 flex gap-2">
      {#if stage.kind === 'select'}
        <SyncButton type="submit" value="cancel">Cancel</SyncButton>
        <SyncButton
          type="button"
          variant="primary"
          disabled={isEmptySelection(selection)}
          onclick={submit}>Import</SyncButton
        >
      {:else if stage.kind === 'done'}
        <SyncButton type="submit" value="done" variant="primary">Close</SyncButton>
      {:else}
        <SyncButton type="submit" value="cancel">Cancel</SyncButton>
      {/if}
    </form>
  </footer>
</div>
