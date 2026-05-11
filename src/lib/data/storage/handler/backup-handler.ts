import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import { readingGoalSortFunction } from '$lib/data/reading-goal';
import { BaseScopedHandler, BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import type { ScopedBookOperations, ScopedSettings } from '$lib/data/storage/handler/handler-roles';
import type { ReplicationContext } from '$lib/functions/replication/replication-progress';
import { BlobReader, BlobWriter, ZipReader, type Entry, type ZipWriter } from '@zip.js/zip.js';

export class BackupStorageHandler extends BaseStorageHandler {
  static readonly appSettingsFilename = 'app-settings.json';

  /**
   * Side file for the localStorage keys that belong to reading goals
   * conceptually but live next to the rest of "settings." Kept
   * separate so the Reading-goals checkbox owns the round-trip.
   */
  static readonly readingGoalStateFilename = 'reading-goal-state.json';

  validRootFiles = [
    BaseStorageHandler.readingGoalsFilePrefix,
    BackupStorageHandler.appSettingsFilename,
    BackupStorageHandler.readingGoalStateFilename
  ];

  /** @internal Used by `ScopedBackupHandler` and one-shot handler writes. */
  exportZipWriter: ZipWriter<Blob> | undefined;

  private importReader: ZipReader<Blob> | undefined;

  /** @internal Used by `ScopedBackupHandler` to find per-book entries. */
  importEntries: Entry[] = [];

  listSyncTitles(_opts?: { refresh?: boolean }) {
    // Backup ZIPs aren't a sync endpoint — placeholder reconciliation
    // is wired to cloud/fs only. The import-backup flow uses
    // setBackupZip + replicateData with explicit contexts.
    return Promise.resolve([]);
  }

  authenticate(): Promise<void> {
    return Promise.resolve();
  }

  deleteBookData() {
    return Promise.resolve({ error: '', deleted: [] });
  }

  updateSettings(window: Window) {
    this.window = window;
  }

  clearData(clearAll = true) {
    if (clearAll) {
      this.exportZipWriter = undefined;
      this.importReader = undefined;
      this.importEntries = [];
    }
  }

  scoped(
    context: ReplicationContext,
    settings: ScopedSettings,
    cancelSignal?: AbortSignal
  ): ScopedBookOperations {
    return new ScopedBackupHandler(this, context, settings, cancelSignal);
  }

  async setBackupZip(data: Blob) {
    this.importReader = new ZipReader(new BlobReader(data));
    this.importEntries = await this.importReader.getEntries();

    const titles = new Map<string, ReplicationContext>();

    for (let index = 0, { length } = this.importEntries; index < length; index += 1) {
      const entry = this.importEntries[index];
      const nameParts = entry.filename.split('/');
      const sanitizedTitle = nameParts[0];
      const title = BaseStorageHandler.desanitizeFilename(sanitizedTitle);

      if (nameParts.length === 1) {
        this.setRootFile(title, { id: title, name: title });
      } else if (nameParts.length > 1) {
        const context = titles.get(title) || { title, imagePath: '' };

        if (entry.filename.startsWith(`${sanitizedTitle}/cover_`)) {
          context.imagePath = entry;
        }

        titles.set(title, context);
      }
    }

    return [...titles.values()];
  }

  saveAppSettings(json: string) {
    return this.saveRootJson(BackupStorageHandler.appSettingsFilename, json);
  }

  getAppSettings() {
    return this.getRootJson(
      BackupStorageHandler.appSettingsFilename,
      'Unable to read app settings'
    );
  }

  saveReadingGoalState(json: string) {
    return this.saveRootJson(BackupStorageHandler.readingGoalStateFilename, json);
  }

  getReadingGoalState() {
    return this.getRootJson(
      BackupStorageHandler.readingGoalStateFilename,
      'Unable to read reading-goal state'
    );
  }

  private async saveRootJson(filename: string, json: string) {
    this.exportZipWriter = await BaseStorageHandler.addDataToZip(
      filename,
      json,
      this.exportZipWriter
    );
  }

  private async getRootJson(
    filename: string,
    errorMessage: string
  ): Promise<Record<string, string> | undefined> {
    const rootFile = this.rootFiles.get(filename);
    const zipEntry = rootFile
      ? this.importEntries.find((e) => e.filename === rootFile.name)
      : undefined;
    if (!zipEntry) return undefined;
    return BaseStorageHandler.extractAsJSON(zipEntry, errorMessage);
  }

  async createExportZip(document: Document, resetOnly: boolean) {
    if (!resetOnly && this.exportZipWriter) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(await this.exportZipWriter.close());
      a.rel = 'noopener';
      a.download = `miwake-reader-export-${new Date()
        .toLocaleString('en-US', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        })
        .replaceAll(/[/:, ]+/g, '-')}.zip`;

      setTimeout(() => {
        URL.revokeObjectURL(a.href);
      }, 1e4);

      setTimeout(() => {
        a.click();
        this.clearData();
      });
    } else if (resetOnly) {
      this.clearData();
    }
  }
}

class ScopedBackupHandler
  extends BaseScopedHandler<BackupStorageHandler>
  implements ScopedBookOperations
{
  isBookPresentAndUpToDate() {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  isProgressPresentAndUpToDate() {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  areStatisticsPresentAndUpToDate() {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  areReadingGoalsPresentAndUpToDate() {
    BaseStorageHandler.reportProgress();
    return Promise.resolve(false);
  }

  async getFilenameForRecentCheck(fileIdentifier: string) {
    if (this.isOverwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    const { filename } = this.handler.validRootFiles.includes(fileIdentifier)
      ? this.getRootFile(fileIdentifier)
      : this.findEntry(fileIdentifier);

    BaseStorageHandler.completeStep();

    return filename;
  }

  async getBook() {
    const { zipEntry, filename } = this.findEntry('bookdata_');

    if (!zipEntry) {
      return undefined;
    }

    const bookBlob = await BaseStorageHandler.readFromZip(
      new BlobWriter(),
      'Unable to read book data',
      zipEntry,
      0.3
    );

    return BaseStorageHandler.extractBookData(bookBlob, filename, {
      progressBase: 0.6,
      cancelSignal: this.cancelSignal
    });
  }

  async getProgress() {
    const { zipEntry } = this.findEntry('progress_');

    if (!zipEntry) {
      return undefined;
    }

    return BaseStorageHandler.extractAsJSON(zipEntry, 'Unable to read progress data');
  }

  async getStatistics() {
    const { zipEntry, filename } = this.findEntry('statistics_');

    if (!zipEntry) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }

    const statistics = await BaseStorageHandler.extractAsJSON(
      zipEntry,
      'Unable to read statistics'
    );

    return {
      statistics,
      lastStatisticModified:
        BaseStorageHandler.getStatisticsMetadata(filename).lastStatisticModified
    };
  }

  async getCover() {
    if (this.context.imagePath instanceof Blob) {
      BaseStorageHandler.reportProgress();

      return this.context.imagePath;
    }

    const { zipEntry } = this.findEntry('cover_');

    if (!zipEntry) {
      return undefined;
    }

    const cover = await BaseStorageHandler.readFromZip(
      new BlobWriter(),
      'Unable to read cover data',
      zipEntry,
      0.9
    );

    return cover;
  }

  async getReadingGoals() {
    const { zipEntry, filename } = this.getRootFile(BaseStorageHandler.readingGoalsFilePrefix);

    if (!zipEntry) {
      return { readingGoals: undefined, lastGoalModified: 0 };
    }

    const readingGoals = await BaseStorageHandler.extractAsJSON(
      zipEntry,
      'Unable to read reading goals'
    );

    return {
      readingGoals,
      lastGoalModified: BaseStorageHandler.getReadingGoalsMetadata(filename).lastGoalModified
    };
  }

  async saveBook(data: Omit<BooksDbBookData, 'id'>) {
    const filename = `${this.sanitizedTitle}/${BaseStorageHandler.getBookFileName(data)}`;
    const zipped = await BaseStorageHandler.zipBookData(data, {
      progressBase: 0.5,
      cancelSignal: this.cancelSignal
    });

    this.handler.exportZipWriter = await BaseStorageHandler.addDataToZip(
      filename,
      zipped,
      this.handler.exportZipWriter,
      { progressBase: 0.5, cancelSignal: this.cancelSignal }
    );

    return 0;
  }

  async saveProgress(data: BooksDbBookmarkData) {
    const filename = `${this.sanitizedTitle}/${BaseStorageHandler.getProgressFileName(data)}`;

    this.handler.exportZipWriter = await BaseStorageHandler.addDataToZip(
      filename,
      JSON.stringify(data),
      this.handler.exportZipWriter,
      { cancelSignal: this.cancelSignal }
    );
  }

  async saveStatistics(data: BooksDbStatistic[], lastStatisticModified: number) {
    const filename = `${this.sanitizedTitle}/${BaseStorageHandler.getStatisticsFileName(
      data,
      lastStatisticModified
    )}`;

    data.sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));

    this.handler.exportZipWriter = await BaseStorageHandler.addDataToZip(
      filename,
      JSON.stringify(data),
      this.handler.exportZipWriter,
      { cancelSignal: this.cancelSignal }
    );
  }

  async saveCover(data: Blob | undefined) {
    if (!data) {
      BaseStorageHandler.reportProgress();
      return;
    }

    const filename = await BaseStorageHandler.getCoverFileName(data);
    this.handler.exportZipWriter = await BaseStorageHandler.addDataToZip(
      `${this.sanitizedTitle}/${filename}`,
      data,
      this.handler.exportZipWriter,
      { cancelSignal: this.cancelSignal }
    );
  }

  async saveReadingGoals(data: BooksDbReadingGoal[], lastGoalModified: number) {
    const filename = `${BaseStorageHandler.getReadingGoalsFileName(lastGoalModified)}`;

    data.sort(readingGoalSortFunction);

    this.handler.exportZipWriter = await BaseStorageHandler.addDataToZip(
      filename,
      JSON.stringify(data),
      this.handler.exportZipWriter,
      { cancelSignal: this.cancelSignal }
    );
  }

  private findEntry(filePrefix: string, progressBase = 0.1) {
    const zipEntry = this.handler.importEntries.find((entry) =>
      entry.filename.startsWith(`${this.sanitizedTitle}/${filePrefix}`)
    );

    BaseStorageHandler.reportProgress(progressBase);

    return { zipEntry, filename: zipEntry?.filename.replace(`${this.sanitizedTitle}/`, '') || '' };
  }

  private getRootFile(filePrefix: string, progressBase = 0.1) {
    const rootFile = this.handler.rootFiles.get(filePrefix);
    const zipEntry = rootFile
      ? this.handler.importEntries.find((entry) => entry.filename === rootFile.name)
      : undefined;

    BaseStorageHandler.reportProgress(progressBase);

    return { zipEntry, filename: zipEntry?.filename || '' };
  }
}
