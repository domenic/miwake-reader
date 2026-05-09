<script lang="ts">
  import { showBackupExportDialog } from '$lib/components/backup/backup-export-dialog.svelte';
  import { showBackupImportDialog } from '$lib/components/backup/backup-import-dialog.svelte';
  import type { BackupCatalog } from '$lib/components/backup/backup-types';
  import { confirmDialog, messageDialog } from '$lib/data/simple-dialogs';
  import { isSyncing$, syncLocation$ } from '$lib/data/sync/sync-store';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import SyncSection from '$lib/components/settings/sync/sync-section.svelte';
  import { showForceResyncDialog } from '$lib/components/settings/sync/force-resync-dialog.svelte';
  import { forceFullResync } from '$lib/data/sync/sync-engine';
  import {
    buildCurrentCatalog,
    exportBackup,
    importBackup,
    parseBackupZip,
    wipeAllStorage
  } from '$lib/data/sync/backup-service';

  let hasSyncLocation = $derived($syncLocation$ !== null);

  async function onExport() {
    const catalog = await buildCurrentCatalog();
    await showBackupExportDialog({ catalog, onExport: exportBackup });
  }

  function pickZipFile(): Promise<File | null> {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip';
      input.addEventListener('change', () => resolve(input.files?.[0] ?? null), { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    });
  }

  async function onImport() {
    const file = await pickZipFile();
    if (!file) return;

    let catalog: BackupCatalog;
    try {
      catalog = await parseBackupZip(file);
    } catch (err: any) {
      await messageDialog({ title: "Couldn't read this backup", message: err.message });
      return;
    }

    await showBackupImportDialog({
      fileName: file.name,
      catalog,
      onImport: (selection, direction) => importBackup(file, catalog, selection, direction)
    });
  }

  async function onForceResync() {
    if (!hasSyncLocation) {
      await messageDialog({
        title: 'No sync location connected',
        message: 'Connect a cloud account or local folder before running a full re-sync.'
      });
      return;
    }

    const result = await showForceResyncDialog({ location: $syncLocation$ });
    if (result.kind === 'cancel') return;

    try {
      // Progress, completion, and errors are reported via the floating
      // sync-status indicator. No dialog here — one popping up while
      // the user is reading or editing would be jarring.
      await forceFullResync(result.direction);
    } catch {
      // Swallow: reportSyncError has already populated syncHealth$,
      // which the indicator and the alerts on this page render in place.
    }
  }

  async function onSignOutAndWipe() {
    const cancelled = await confirmDialog({
      title: 'Sign out and wipe local data?',
      message:
        'This will disconnect all sync locations and remove all books, bookmarks, statistics, reading goals, and app settings from this device. Your data stored elsewhere will not be changed.'
    });
    if (cancelled) return;

    try {
      await wipeAllStorage();
    } catch (err: any) {
      await messageDialog({ title: "Couldn't fully wipe local data", message: err.message });
    }
  }

  interface Item {
    title: string;
    description: string;
    action: string;
    variant?: 'default' | 'danger';
    danger?: boolean;
    disabled?: boolean;
    onclick: () => unknown;
  }

  // Force re-sync disables (and relabels) while any sync is in flight —
  // both this one and an ambient push that happened to start at the
  // same time. Same lock prevents double-start.
  let items: Item[] = $derived([
    {
      title: 'Export backup to ZIP',
      description: 'Save selected books, bookmarks, statistics, and settings to a ZIP file.',
      action: 'Export',
      onclick: onExport
    },
    {
      title: 'Import backup from ZIP',
      description: 'Restore from a previously exported backup file.',
      action: 'Import',
      onclick: onImport
    },
    {
      title: 'Force full re-sync',
      description:
        'Walk every file in your library to ensure there are no differences between your sync location and this device. Useful if you suspect something drifted.',
      action: $isSyncing$ ? 'Syncing…' : 'Re-sync',
      disabled: $isSyncing$,
      onclick: onForceResync
    },
    {
      title: 'Sign out and wipe local data',
      description:
        'Disconnect your sync location and delete everything from this device. Your data stored elsewhere is unchanged.',
      action: 'Sign out and wipe',
      variant: 'danger',
      danger: true,
      onclick: onSignOutAndWipe
    }
  ]);
</script>

<SyncSection title="Data management">
  {#each items as item, i (item.title)}
    <div
      class="flex items-center justify-between gap-4 py-3"
      class:border-t={i > 0}
      class:border-gray-400={i > 0}
      class:border-opacity-40={i > 0}
    >
      <div class="flex-1">
        <div class="font-medium" class:text-red-800={item.danger}>
          {item.title}
        </div>
        <div class="mt-0.5 text-sm text-gray-600">{item.description}</div>
      </div>
      <SyncButton variant={item.variant} disabled={item.disabled} onclick={item.onclick}
        >{item.action}</SyncButton
      >
    </div>
  {/each}
</SyncSection>
