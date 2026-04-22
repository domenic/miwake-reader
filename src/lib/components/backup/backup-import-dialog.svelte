<script module lang="ts">
  import BackupImportDialog from '$lib/components/backup/backup-import-dialog.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
  import type {
    BackupCatalog as BackupCatalog_,
    BackupSelection as BackupSelection_
  } from '$lib/components/backup/backup-types';

  export function showBackupImportDialog(params: {
    parseZip: (file: File) => Promise<BackupCatalog_>;
    onImport: (selection: BackupSelection_) => Promise<{
      books: number;
      bookmarks: number;
      statistics: number;
      readingGoals: boolean;
      appSettings: boolean;
    }>;
  }): Promise<void> {
    return showDialog<void>(
      BackupImportDialog,
      { parseZip: params.parseZip, onImport: params.onImport },
      {
        closedBy: 'closerequest',
        resolveResult: () => undefined
      }
    );
  }
</script>

<script lang="ts">
  import Fa from 'svelte-fa';
  import { faFileArrowUp } from '@fortawesome/free-solid-svg-icons';
  import BackupSelectionTree from '$lib/components/backup/backup-selection-tree.svelte';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import { appName } from '$lib/data/env';
  import {
    isEmptySelection,
    type BackupCatalog,
    type BackupSelection
  } from '$lib/components/backup/backup-types';

  interface Props {
    parseZip: (file: File) => Promise<BackupCatalog>;
    onImport: (selection: BackupSelection) => Promise<{
      books: number;
      bookmarks: number;
      statistics: number;
      readingGoals: boolean;
      appSettings: boolean;
    }>;
  }

  let { parseZip, onImport }: Props = $props();

  type Stage =
    | { kind: 'file-pick' }
    | { kind: 'parsing'; fileName: string }
    | { kind: 'parse-error'; fileName: string; message: string }
    | { kind: 'select'; fileName: string; catalog: BackupCatalog }
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

  let stage = $state<Stage>({ kind: 'file-pick' });
  let selection = $state<BackupSelection>({
    appSettings: false,
    readingGoals: false,
    perBook: new Map()
  });

  async function onFilePicked(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    stage = { kind: 'parsing', fileName: file.name };
    try {
      const catalog = await parseZip(file);
      selection = {
        appSettings: catalog.hasAppSettings,
        readingGoals: catalog.hasReadingGoals,
        perBook: new Map(
          catalog.books.map((b) => [
            b.id,
            { book: true as const, bookmarks: b.hasBookmark, statistics: b.hasStatistics }
          ])
        )
      };
      stage = { kind: 'select', fileName: file.name, catalog };
    } catch (err) {
      stage = {
        kind: 'parse-error',
        fileName: file.name,
        message: err instanceof Error ? err.message : String(err)
      };
    } finally {
      input.value = '';
    }
  }

  async function submit() {
    if (stage.kind !== 'select' || isEmptySelection(selection)) return;
    stage = { kind: 'importing' };
    try {
      const result = await onImport(selection);
      stage = { kind: 'done', result };
    } catch (err) {
      stage = {
        kind: 'parse-error',
        fileName: '',
        message: err instanceof Error ? err.message : String(err)
      };
    }
  }
</script>

<div class="w-[560px] max-w-full">
  <header class="border-b border-black/10 pb-4">
    <h2 class="text-xl font-medium">Import backup</h2>
    <p class="mt-1 text-sm text-gray-600">
      Restore from a ZIP backup previously exported by {appName}.
    </p>
  </header>

  <div class="py-4">
    {#if stage.kind === 'file-pick'}
      <label
        class="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-md border-2 border-dashed border-black/15 px-6 py-10 text-center hover:bg-gray-50"
      >
        <Fa icon={faFileArrowUp} class="text-2xl text-gray-500" />
        <div class="text-sm font-medium">Choose a ZIP file</div>
        <div class="text-xs text-gray-500">or drop one here</div>
        <input type="file" accept=".zip,application/zip" class="hidden" onchange={onFilePicked} />
      </label>
    {:else if stage.kind === 'parsing'}
      <div class="py-10 text-center text-sm text-gray-600">
        Reading <span class="font-mono">{stage.fileName}</span>
      </div>
    {:else if stage.kind === 'parse-error'}
      <div class="rounded-md bg-red-50 px-3 py-3 text-sm text-red-900">
        <div class="font-medium">Couldn't read this backup.</div>
        <div class="mt-1 text-xs">{stage.message}</div>
        <button
          type="button"
          class="mt-2 cursor-pointer text-xs underline"
          onclick={() => (stage = { kind: 'file-pick' })}>Choose a different file</button
        >
      </div>
    {:else if stage.kind === 'select'}
      <div class="mb-3 text-xs text-gray-600">
        From <span class="font-mono">{stage.fileName}</span>. Items will be merged with your current
        library per your current sync settings (Advanced).
      </div>
      <BackupSelectionTree
        catalog={stage.catalog}
        {selection}
        onchange={(next) => (selection = next)}
      />
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
