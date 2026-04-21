<script lang="ts">
  import { showBackupExportDialog } from '$lib/components/backup/backup-export-dialog.svelte';
  import { showBackupImportDialog } from '$lib/components/backup/backup-import-dialog.svelte';
  import type { BackupCatalog } from '$lib/components/backup/backup-types';
  import { confirmDialog, messageDialog } from '$lib/data/simple-dialogs';
  import {
    cloudConnection$,
    cloudHealth$,
    fsConnection$,
    fsHealth$
  } from '$lib/data/sync/sync-store';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import SyncSection from '$lib/components/settings/sync/sync-section.svelte';

  let hasAnyBackend = $derived($cloudConnection$ !== null || $fsConnection$ !== null);

  async function buildCurrentCatalog(): Promise<BackupCatalog> {
    // Phase 1 stub. Phase 6 will query IndexedDB for real books / bookmarks / stats.
    return {
      hasAppSettings: true,
      hasReadingGoals: true,
      books: []
    };
  }

  async function onExport() {
    const catalog = await buildCurrentCatalog();
    await showBackupExportDialog({
      catalog,
      onExport: async () => {
        await messageDialog({
          title: 'Export backup',
          message:
            'Backup export is not wired up yet (coming in Phase 6). Your selection has been captured but no ZIP will be generated.'
        });
      }
    });
  }

  async function onImport() {
    await showBackupImportDialog({
      parseZip: async () => {
        // Phase 1 stub. Phase 6 will actually open the ZIP.
        throw new Error(
          'Backup import is not wired up yet (coming in Phase 6). Nothing was imported.'
        );
      },
      onImport: async () => ({
        books: 0,
        bookmarks: 0,
        statistics: 0,
        readingGoals: false,
        appSettings: false
      })
    });
  }

  async function onForceResync() {
    if (!hasAnyBackend) {
      await messageDialog({
        title: 'No backends connected',
        message: 'Connect a cloud account or local folder before running a full re-sync.'
      });
      return;
    }

    const cancelled = await confirmDialog({
      title: 'Force full re-sync?',
      message:
        'This will compare everything in your library to your connected backends and reconcile any differences. It may take a few minutes and will use bandwidth.'
    });
    if (cancelled) return;

    await messageDialog({
      title: 'Force re-sync',
      message: 'Sync engine is not wired up yet (coming in Phase 4).'
    });
  }

  async function onSignOutAndWipe() {
    const cancelled = await confirmDialog({
      title: 'Sign out and wipe local data?',
      message:
        'This will disconnect all backends and remove all books, bookmarks, statistics, reading goals, and app settings from this device. Your cloud data will not be changed.'
    });
    if (cancelled) return;

    cloudConnection$.next(null);
    fsConnection$.next(null);
    cloudHealth$.next({ status: 'ok' });
    fsHealth$.next({ status: 'ok' });

    await messageDialog({
      title: 'Not fully wired up',
      message:
        'The sign-out flow only clears sync settings for now. Local data wipe will be implemented in Phase 4.'
    });
  }

  const items: {
    title: string;
    description: string;
    action: string;
    variant?: 'default' | 'danger';
    danger?: boolean;
    onclick: () => unknown;
  }[] = [
    {
      title: 'Export backup to ZIP',
      description: 'Save selected books, bookmarks, statistics, and settings to a ZIP file.',
      action: 'Export…',
      onclick: onExport
    },
    {
      title: 'Import backup from ZIP',
      description: 'Restore from a previously exported backup file.',
      action: 'Import…',
      onclick: onImport
    },
    {
      title: 'Force full re-sync',
      description: 'Reconcile this device with all connected backends. Uses bandwidth.',
      action: 'Force re-sync',
      onclick: onForceResync
    },
    {
      title: 'Sign out and wipe local data',
      description:
        'Disconnect all backends and delete everything from this device. Cloud data is unchanged.',
      action: 'Sign out and wipe',
      variant: 'danger',
      danger: true,
      onclick: onSignOutAndWipe
    }
  ];
</script>

<SyncSection title="Data management">
  {#each items as item (item.title)}
    <div class="flex items-center justify-between gap-4 border-t border-black/10 px-5 py-3">
      <div class="flex-1">
        <div
          class="text-sm font-medium"
          class:text-red-700={item.danger}
          class:text-black={!item.danger}
        >
          {item.title}
        </div>
        <div class="mt-0.5 text-xs text-gray-600">{item.description}</div>
      </div>
      <SyncButton variant={item.variant} onclick={item.onclick}>{item.action}</SyncButton>
    </div>
  {/each}
</SyncSection>
