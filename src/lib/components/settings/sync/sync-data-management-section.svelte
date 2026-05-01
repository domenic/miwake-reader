<script lang="ts">
  import { showBackupExportDialog } from '$lib/components/backup/backup-export-dialog.svelte';
  import { showBackupImportDialog } from '$lib/components/backup/backup-import-dialog.svelte';
  import type { BackupBook, BackupCatalog } from '$lib/components/backup/backup-types';
  import { confirmDialog, messageDialog } from '$lib/data/simple-dialogs';
  import {
    cacheStorageData$,
    database,
    lastReadingGoalsModified$,
    readingGoalsMergeMode$,
    statisticsMergeMode$
  } from '$lib/data/store';
  import { pagePath } from '$lib/data/env';
  import { cloudConnection$, fsConnection$, isSyncing$ } from '$lib/data/sync/sync-store';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import SyncSection from '$lib/components/settings/sync/sync-section.svelte';
  import { showForceResyncDialog } from '$lib/components/settings/sync/force-resync-dialog.svelte';
  import { forceFullResync } from '$lib/data/sync/sync-engine';
  import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
  import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
  import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
  import { StorageDataType, StorageKey } from '$lib/data/storage/storage-types';
  import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
  import { replicateData } from '$lib/functions/replication/replicator';
  import { BlobReader, ZipReader } from '@zip.js/zip.js';

  let hasAnySyncLocation = $derived($cloudConnection$ !== null || $fsConnection$ !== null);

  async function buildCurrentCatalog(): Promise<BackupCatalog> {
    const db = await database.db;
    const [allBooks, allBookmarks, allStats, allGoals] = await Promise.all([
      db.getAll('data'),
      db.getAll('bookmark'),
      db.getAll('statistic'),
      db.getAll('readingGoal')
    ]);

    const bookmarkIds = new Set(allBookmarks.map((b) => b.dataId));
    const statTitles = new Set(allStats.map((s) => s.title));

    // Skip placeholders — no content to export — same reason /b refuses to
    // open them without a sync location.
    const books: BackupBook[] = allBooks
      .filter((b) => !!b.elementHtml)
      .map((b) => ({
        id: b.id,
        title: b.title,
        hasBookmark: bookmarkIds.has(b.id),
        hasStatistics: statTitles.has(b.title)
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    return {
      hasAppSettings: localStorage.length > 0,
      // Reading goals split between the IDB table (archived) and the
      // localStorage current goal — either is worth exporting.
      hasReadingGoals: allGoals.length > 0 || $lastReadingGoalsModified$ > 0,
      books
    };
  }

  async function onExport() {
    const catalog = await buildCurrentCatalog();
    await showBackupExportDialog({
      catalog,
      onExport: async (selection) => {
        const backupHandler = getStorageHandler(
          window,
          StorageKey.BACKUP,
          '',
          false,
          $cacheStorageData$,
          ReplicationSaveBehavior.NewOnly,
          $statisticsMergeMode$,
          $readingGoalsMergeMode$
        );
        backupHandler.clearData();

        const browserHandler = getStorageHandler(
          window,
          StorageKey.BROWSER,
          '',
          false,
          $cacheStorageData$,
          ReplicationSaveBehavior.NewOnly,
          $statisticsMergeMode$,
          $readingGoalsMergeMode$
        );

        const db = await database.db;
        const allBooks = await db.getAll('data');
        const booksById = new Map(allBooks.map((b) => [b.id, b]));

        for (const [bookId, choices] of selection.perBook) {
          const book = booksById.get(bookId);
          if (!book) continue;
          const types: StorageDataType[] = [StorageDataType.DATA];
          if (choices.bookmarks) types.push(StorageDataType.PROGRESS);
          if (choices.statistics) types.push(StorageDataType.STATISTICS);
          const error = await replicateData(
            browserHandler,
            backupHandler,
            false,
            [{ id: book.id, title: book.title, imagePath: book.coverImage ?? '' }],
            types
          );
          if (error) throw new Error(error);
        }

        if (selection.readingGoals) {
          const error = await replicateData(
            browserHandler,
            backupHandler,
            false,
            [],
            [StorageDataType.READING_GOALS]
          );
          if (error) throw new Error(error);
        }

        if (selection.appSettings) {
          const snapshot: Record<string, string> = {};
          for (let i = 0; i < localStorage.length; i += 1) {
            const key = localStorage.key(i);
            if (key === null) continue;
            const value = localStorage.getItem(key);
            if (value !== null) snapshot[key] = value;
          }
          await backupHandler.saveAppSettings(JSON.stringify(snapshot));
        }

        await backupHandler.createExportZip(document, false);
      }
    });
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

  /**
   * Walk the ZIP entries to derive a catalog. Doesn't reuse the
   * BackupStorageHandler because the handler's setBackupZip mutates
   * its singleton state, and we want the inspection step to be free
   * of side effects. The actual import re-opens the same blob via
   * setBackupZip when the user confirms.
   *
   * Tolerates ZIPs from older miwake / tsutsu builds: missing
   * app-settings.json or reading goals just turn off those checkboxes.
   */
  async function parseZipCatalog(file: File): Promise<BackupCatalog> {
    const reader = new ZipReader(new BlobReader(file));
    try {
      const entries = await reader.getEntries();
      const books = new Map<string, BackupBook>();
      let hasReadingGoals = false;
      let hasAppSettings = false;
      let nextId = 1;

      for (const entry of entries) {
        const parts = entry.filename.split('/');
        if (parts.length === 1) {
          if (entry.filename.startsWith(BaseStorageHandler.readingGoalsFilePrefix)) {
            hasReadingGoals = true;
          } else if (entry.filename === BackupStorageHandler.appSettingsFilename) {
            hasAppSettings = true;
          }
          continue;
        }

        const title = BaseStorageHandler.desanitizeFilename(parts[0]);
        const inner = parts.slice(1).join('/');
        let book = books.get(title);
        if (!book) {
          book = { id: nextId, title, hasBookmark: false, hasStatistics: false };
          nextId += 1;
          books.set(title, book);
        }
        if (inner.startsWith('progress_')) book.hasBookmark = true;
        if (inner.startsWith('statistics_')) book.hasStatistics = true;
      }

      return {
        hasAppSettings,
        hasReadingGoals,
        books: [...books.values()].sort((a, b) => a.title.localeCompare(b.title))
      };
    } finally {
      await reader.close();
    }
  }

  async function onImport() {
    const file = await pickZipFile();
    if (!file) return;

    let catalog: BackupCatalog;
    try {
      catalog = await parseZipCatalog(file);
    } catch (err: any) {
      await messageDialog({
        title: "Couldn't read this backup",
        message: err.message
      });
      return;
    }

    await showBackupImportDialog({
      fileName: file.name,
      catalog,
      onImport: async (selection, direction) => {
        // ZIP-wins: source's getFilenameForRecentCheck returns undefined
        // when saveBehavior=Overwrite, so the replicator's per-type
        // up-to-date check always falls through and the ZIP version is
        // written every time. Keep-newest leaves NewOnly in place so
        // each item's timestamp wins.
        const sourceBehavior =
          direction === 'zip-wins'
            ? ReplicationSaveBehavior.Overwrite
            : ReplicationSaveBehavior.NewOnly;

        const backupHandler = getStorageHandler(
          window,
          StorageKey.BACKUP,
          '',
          true,
          $cacheStorageData$,
          sourceBehavior,
          $statisticsMergeMode$,
          $readingGoalsMergeMode$
        );
        const browserHandler = getStorageHandler(
          window,
          StorageKey.BROWSER,
          '',
          true,
          $cacheStorageData$,
          ReplicationSaveBehavior.NewOnly,
          $statisticsMergeMode$,
          $readingGoalsMergeMode$
        );

        const allContexts = await backupHandler.setBackupZip(file);
        const contextsByTitle = new Map(allContexts.map((c) => [c.title, c]));

        let booksImported = 0;
        let bookmarksImported = 0;
        let statisticsImported = 0;

        for (const [bookId, choices] of selection.perBook) {
          const book = catalog.books.find((b) => b.id === bookId);
          const ctx = book ? contextsByTitle.get(book.title) : undefined;
          if (!ctx) continue;
          const types: StorageDataType[] = [StorageDataType.DATA];
          if (choices.bookmarks) types.push(StorageDataType.PROGRESS);
          if (choices.statistics) types.push(StorageDataType.STATISTICS);

          const error = await replicateData(backupHandler, browserHandler, true, [ctx], types);
          if (error) throw new Error(error);

          booksImported += 1;
          if (choices.bookmarks) bookmarksImported += 1;
          if (choices.statistics) statisticsImported += 1;
        }

        let readingGoalsImported = false;
        if (selection.readingGoals && catalog.hasReadingGoals) {
          const error = await replicateData(
            backupHandler,
            browserHandler,
            false,
            [],
            [StorageDataType.READING_GOALS]
          );
          if (error) throw new Error(error);
          readingGoalsImported = true;
        }

        let appSettingsImported = false;
        if (selection.appSettings && catalog.hasAppSettings) {
          const snapshot = await backupHandler.getAppSettings();
          if (snapshot) {
            // ZIP-wins for app settings = wipe, then restore. Keep-newest
            // = additive merge (only set keys we don't already have).
            // localStorage-backed BehaviorSubjects don't react to
            // out-of-band writes, so we'll have to reload either way.
            if (direction === 'zip-wins') localStorage.clear();
            for (const [k, v] of Object.entries(snapshot)) {
              if (direction === 'newest' && localStorage.getItem(k) !== null) continue;
              localStorage.setItem(k, v);
            }
            appSettingsImported = true;
          }
        }

        backupHandler.clearData();

        // localStorage-backed stores don't observe storage events, so we
        // need a hard reload for app-settings to take effect. Even
        // without app settings, a reload guarantees the library and
        // tracker re-read fresh state — cheaper than tracking down
        // every component that should refresh.
        if (booksImported > 0 || readingGoalsImported || appSettingsImported) {
          setTimeout(() => window.location.replace(pagePath || '/'), 0);
        }

        return {
          books: booksImported,
          bookmarks: bookmarksImported,
          statistics: statisticsImported,
          readingGoals: readingGoalsImported,
          appSettings: appSettingsImported
        };
      }
    });
  }

  async function onForceResync() {
    if (!hasAnySyncLocation) {
      await messageDialog({
        title: 'No sync locations connected',
        message: 'Connect a cloud account or local folder before running a full re-sync.'
      });
      return;
    }

    const result = await showForceResyncDialog({
      cloud: $cloudConnection$,
      fs: $fsConnection$
    });
    if (result.kind === 'cancel') return;

    try {
      // Progress, completion, and errors are reported via the floating
      // sync-status indicator (spinner → "Synced just now" → red/amber
      // with detail on failure). No dialog here — one popping up while
      // the user is reading or editing would be jarring.
      await forceFullResync(result.direction);
    } catch {
      // Swallow: reportSyncError has already populated cloudHealth$ /
      // fsHealth$, which the indicator and the alerts on this page
      // render in place.
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
      // Close the open IndexedDB connection so deleteDatabase doesn't
      // get stuck on `blocked`. Then nuke the DB, clear localStorage
      // (which is where settings, themes, sync state, reader prefs and
      // custom OAuth creds all live), and reload to a fresh boot.
      const db = await database.db;
      db.close();
      await deleteDatabase('books');
      localStorage.clear();
      window.location.replace(pagePath || '/');
    } catch (err: any) {
      await messageDialog({
        title: "Couldn't fully wipe local data",
        message: err.message
      });
    }
  }

  function deleteDatabase(name: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.deleteDatabase(name);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error(`Failed to delete database ${name}`));
      req.onblocked = () =>
        reject(
          new Error(
            `Database ${name} is still open in another tab. Close other tabs of this site and try again.`
          )
        );
    });
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
        'Walk every file in your library to ensure there are no differences between your sync locations and this device. Useful if you suspect something drifted.',
      action: $isSyncing$ ? 'Syncing…' : 'Re-sync',
      disabled: $isSyncing$,
      onclick: onForceResync
    },
    {
      title: 'Sign out and wipe local data',
      description:
        'Disconnect all sync locations and delete everything from this device. Your data stored elsewhere is unchanged.',
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
