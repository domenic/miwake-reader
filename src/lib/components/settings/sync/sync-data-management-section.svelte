<script lang="ts">
  import { showBackupExportDialog } from '$lib/components/backup/backup-export-dialog.svelte';
  import { showBackupImportDialog } from '$lib/components/backup/backup-import-dialog.svelte';
  import type { BackupCatalog } from '$lib/components/backup/backup-types';
  import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
  import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import { showMessageDialog } from '$lib/components/message-dialog.svelte';
  import { syncState } from '$lib/data/sync/sync-store.svelte';
  import SettingsButton from '$lib/components/settings/settings-button.svelte';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SettingsSection from '$lib/components/settings/settings-section.svelte';
  import { showForceResyncDialog } from '$lib/components/settings/sync/force-resync-dialog.svelte';
  import { forceFullResync } from '$lib/data/sync/sync-engine';
  import {
    buildCurrentCatalog,
    exportBackup,
    importBackup,
    parseBackupZIP,
    wipeAllStorage
  } from '$lib/data/sync/backup-service';

  let hasSyncLocation = $derived(syncState.location !== null);

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
      catalog = await parseBackupZIP(file);
    } catch (error) {
      await showErrorDialog({ title: 'Error reading backup', error });
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
      await showMessageDialog({
        title: 'No sync location connected',
        message: 'Connect a cloud account or local folder before running a full re-sync.'
      });
      return;
    }

    const result = await showForceResyncDialog({ location: syncState.location });
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
    const confirmed = await showConfirmDialog({
      title: 'Sign out and wipe local data?',
      message:
        'This will disconnect all sync locations and remove all books, bookmarks, statistics, reading goals, and app settings from this device. Your data stored elsewhere will not be changed.',
      confirmLabel: 'Sign out and wipe',
      danger: true
    });
    if (!confirmed) return;

    try {
      await wipeAllStorage();
    } catch (error) {
      await showErrorDialog({ title: 'Error wiping local data', error });
    }
  }
</script>

<SettingsSection title="Data management">
  <SettingsItem
    label="Export backup to ZIP"
    description="Saves selected books, bookmarks, statistics, and settings to a ZIP file."
  >
    {#snippet control()}
      <SettingsButton onclick={onExport}>Export</SettingsButton>
    {/snippet}
  </SettingsItem>

  <SettingsItem
    label="Import backup from ZIP"
    description="Restores from a previously exported backup file."
  >
    {#snippet control()}
      <SettingsButton onclick={onImport}>Import</SettingsButton>
    {/snippet}
  </SettingsItem>

  <SettingsItem
    label="Force full re-sync"
    description="Checks every file in your library for differences between your sync location and this device. This is useful if you suspect something drifted."
  >
    {#snippet control()}
      <!-- Both a re-sync started here and an ambient push lock this action against double-starts. -->
      <SettingsButton
        disabled={syncState.isSyncing || syncState.isSyncPending}
        onclick={onForceResync}
      >
        {syncState.isSyncing ? 'Syncing…' : syncState.isSyncPending ? 'Sync pending…' : 'Re-sync'}
      </SettingsButton>
    {/snippet}
  </SettingsItem>

  <SettingsItem
    label="Sign out and wipe local data"
    description="Disconnects your sync location and deletes everything from this device. Your data stored elsewhere is unchanged."
    tone="danger"
  >
    {#snippet control()}
      <SettingsButton variant="danger" onclick={onSignOutAndWipe}>Sign out and wipe</SettingsButton>
    {/snippet}
  </SettingsItem>
</SettingsSection>
