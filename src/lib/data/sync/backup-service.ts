import type {
  BackupBook,
  BackupCatalog,
  BackupImportDirection,
  BackupSelection
} from '$lib/components/backup/backup-types';
import { BlobReader, ZipReader } from '@zip.js/zip.js';
import { database, lastReadingGoalsModified$ } from '$lib/data/store';
import { localStoragePreferences } from '$lib/data/internal/writable-storage-subject';
import { pagePath } from '$lib/data/env';
import { BackupStorageHandler } from '$lib/data/storage/handler/backup-handler';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import { getLocalEndpoint, getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import { StorageDataType, SyncEndpointType } from '$lib/data/storage/storage-types';
import { replicateData } from '$lib/functions/replication/replicator';
import { scopedSettings } from '$lib/data/sync/sync-engine';

/**
 * Reading-goal data lives in two places: archived goals in IDB's
 * `readingGoal` table, and the user's *current* goal + its
 * lastModified timestamp in localStorage. Both belong conceptually
 * under the Reading-goals checkbox; these keys are filtered out of
 * the app-settings export so the checkbox is the sole owner.
 */
const READING_GOAL_LOCALSTORAGE_KEYS = ['readingGoal', 'lastReadingGoalsModified'] as const;

/**
 * Whether a localStorage key belongs to the App-settings checkbox.
 * The set comes from the registry maintained by writableStorageSubject —
 * every preference store self-registers, every runtime store opts out.
 * Reading-goal keys are preferences-of-a-sort but owned by the
 * Reading-goals checkbox, not App settings.
 */
function isAppSetting(key: string): boolean {
  if ((READING_GOAL_LOCALSTORAGE_KEYS as readonly string[]).includes(key)) return false;
  return localStoragePreferences.has(key);
}

export async function buildCurrentCatalog(): Promise<BackupCatalog> {
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
    // localStorage.getItem catches "user has ever interacted with goals";
    // lastReadingGoalsModified$ is a sync-marker timestamp, not a
    // presence signal.
    hasReadingGoals: allGoals.length > 0 || localStorage.getItem('readingGoal') !== null,
    books
  };
}

export async function exportBackup(selection: BackupSelection): Promise<void> {
  // Drives BackupStorageHandler directly rather than going through
  // replicateData. We already know exactly what to write, and
  // replicateData's auto-finalize-on-BackupStorageHandler-target
  // makes it awkward to add side files (app-settings.json,
  // reading-goal-state.json).
  const backupHandler = getSyncEndpoint(window, SyncEndpointType.BACKUP);
  backupHandler.clearData();

  const db = await database.db;
  // Export writes the snapshot the user is exporting — the ZIP is
  // authoritative for whatever ends up in it, so use winner-takes-all
  // settings (Overwrite + replace). The merge-mode fields are unused
  // by the BackupStorageHandler save paths but required by the type.
  const exportSettings = scopedSettings({ winnerTakesAll: true });

  for (const [bookId, choices] of selection.perBook) {
    const book = await database.getData(bookId);
    if (!book) continue;
    const scoped = backupHandler.scoped(
      { id: 0, title: book.title, imagePath: book.coverImage ?? '' },
      exportSettings
    );
    await scoped.saveBook(book);
    if (book.coverImage instanceof Blob) {
      await scoped.saveCover(book.coverImage);
    }
    if (choices.bookmarks) {
      const bookmark = await database.getBookmark(book.id);
      if (bookmark) await scoped.saveProgress(bookmark);
    }
    if (choices.statistics) {
      const stats = await database.getStatisticsForBook(book.title);
      if (stats.length > 0) {
        const lastModified = await database.getLastModifiedForType(
          book.title,
          StorageDataType.STATISTICS
        );
        await scoped.saveStatistics(stats, lastModified);
      }
    }
  }

  if (selection.readingGoals) {
    const goals = await db.getAll('readingGoal');
    if (goals.length > 0) {
      await backupHandler.saveReadingGoals(
        goals,
        lastReadingGoalsModified$.getValue(),
        exportSettings
      );
    }
    // Current-goal-in-localStorage travels alongside, owned by the
    // Reading-goals checkbox.
    const goalState: Record<string, string> = {};
    for (const key of READING_GOAL_LOCALSTORAGE_KEYS) {
      const v = localStorage.getItem(key);
      if (v !== null) goalState[key] = v;
    }
    if (Object.keys(goalState).length > 0) {
      await backupHandler.saveReadingGoalState(JSON.stringify(goalState));
    }
  }

  if (selection.appSettings) {
    // Iterate the registry, not localStorage. Defaults the user never
    // explicitly changed are still "their preferences"; restoring on a
    // fresh device should reproduce the same effective settings, not
    // just the deltas from current defaults.
    const snapshot: Record<string, string> = {};
    for (const key of localStoragePreferences.keys()) {
      if (!isAppSetting(key)) continue;
      const value = localStoragePreferences.serialize(key);
      if (value !== undefined) snapshot[key] = value;
    }
    await backupHandler.saveAppSettings(JSON.stringify(snapshot));
  }

  await backupHandler.createExportZip(document, false);
}

/**
 * Walk the ZIP entries to derive a catalog. Doesn't reuse
 * BackupStorageHandler because the handler's setBackupZip mutates its
 * singleton state, and we want the inspection step to be free of side
 * effects. The actual import re-opens the same blob via setBackupZip
 * when the user confirms.
 *
 * Tolerates ZIPs from older miwake / tsutsu builds: missing
 * app-settings.json or reading goals just turn off those checkboxes.
 */
export async function parseBackupZip(file: File): Promise<BackupCatalog> {
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
        if (
          entry.filename.startsWith(BaseStorageHandler.readingGoalsFilePrefix) ||
          entry.filename === BackupStorageHandler.readingGoalStateFilename
        ) {
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

export interface BackupImportResult {
  books: number;
  bookmarks: number;
  statistics: number;
  readingGoals: boolean;
  appSettings: boolean;
}

export async function importBackup(
  file: File,
  catalog: BackupCatalog,
  selection: BackupSelection,
  direction: BackupImportDirection
): Promise<BackupImportResult> {
  // ZIP-wins forces every "target survives" knob into "source
  // replaces target" mode at once via scopedSettings. Keep-newest
  // uses the user's ambient prefs so each item still wins by
  // timestamp.
  const backupHandler = getSyncEndpoint(window, SyncEndpointType.BACKUP);
  const browserHandler = getLocalEndpoint();

  const allContexts = await backupHandler.setBackupZip(file);
  const contextsByTitle = new Map(allContexts.map((c) => [c.title, c]));
  const importSettings = scopedSettings({ winnerTakesAll: direction === 'zip-wins' });

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

    await replicateData({
      library: browserHandler,
      endpoint: backupHandler,
      direction: 'pull',
      refreshDataList: true,
      contexts: [ctx],
      dataToReplicate: types,
      settings: importSettings
    });

    booksImported += 1;
    if (choices.bookmarks) bookmarksImported += 1;
    if (choices.statistics) statisticsImported += 1;
  }

  let readingGoalsImported = false;
  if (selection.readingGoals && catalog.hasReadingGoals) {
    await replicateData({
      library: browserHandler,
      endpoint: backupHandler,
      direction: 'pull',
      refreshDataList: false,
      contexts: [],
      dataToReplicate: [StorageDataType.READING_GOALS],
      settings: importSettings
    });

    // Restore the localStorage current goal alongside the IDB archive
    // (mirrors the export side). Older ZIPs without this side file
    // just skip — older readers didn't have a current goal in
    // localStorage anyway.
    const goalState = await backupHandler.getReadingGoalState();
    if (goalState) {
      for (const [k, v] of Object.entries(goalState)) {
        if (direction === 'newest' && localStorage.getItem(k) !== null) continue;
        localStorage.setItem(k, v);
      }
    }
    readingGoalsImported = true;
  }

  let appSettingsImported = false;
  if (selection.appSettings && catalog.hasAppSettings) {
    const snapshot = await backupHandler.getAppSettings();
    if (snapshot) {
      // ZIP-wins for app settings = wipe, then restore. Keep-newest =
      // additive merge (only set keys we don't already have).
      // localStorage-backed BehaviorSubjects don't react to
      // out-of-band writes, so we'll have to reload either way. Both
      // reading-goal and runtime-sync keys are filtered: reading-goal
      // travels with its own checkbox, runtime-sync is rebuilt from
      // IndexedDB at boot. Skipping them here also defends against
      // older ZIPs that bundled them.
      if (direction === 'zip-wins') {
        for (let i = localStorage.length - 1; i >= 0; i -= 1) {
          const key = localStorage.key(i);
          if (key === null) continue;
          if (!isAppSetting(key)) continue;
          localStorage.removeItem(key);
        }
      }
      for (const [k, v] of Object.entries(snapshot)) {
        if (!isAppSetting(k)) continue;
        if (direction === 'newest' && localStorage.getItem(k) !== null) continue;
        localStorage.setItem(k, v);
      }
      appSettingsImported = true;
    }
  }

  backupHandler.clearData();

  // localStorage-backed stores don't observe storage events, so we
  // need a hard reload for app-settings to take effect. Even without
  // app settings, a reload guarantees the library and tracker re-read
  // fresh state — cheaper than tracking down every component that
  // should refresh.
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

/**
 * Clear every IndexedDB store + all localStorage, then reload to a
 * fresh boot. Doesn't deleteDatabase: that races with in-flight
 * transactions from RxJS subscribers (dataList$, bookmarks$) and
 * surfaces a misleading "still open in another tab" error. Clearing
 * stores is atomic in one transaction and leaves the schema intact —
 * the next boot finds empty stores and behaves identically to a
 * fresh install.
 */
export async function wipeAllStorage(): Promise<void> {
  const db = await database.db;
  const storeNames = [...db.objectStoreNames] as Array<
    Parameters<typeof db.transaction>[0] extends infer T
      ? T extends readonly (infer U)[]
        ? U
        : never
      : never
  >;
  const tx = db.transaction(storeNames, 'readwrite');
  await Promise.all(storeNames.map((name) => tx.objectStore(name).clear()));
  await tx.done;

  localStorage.clear();
  window.location.replace(pagePath || '/');
}
