import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import type { MergeMode } from '$lib/data/merge-mode';
import { readingGoalSortFunction } from '$lib/data/reading-goal';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
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

  protected validRootFiles = [
    BaseStorageHandler.readingGoalsFilePrefix,
    BackupStorageHandler.appSettingsFilename,
    BackupStorageHandler.readingGoalStateFilename
  ];

  private exportZipWriter: ZipWriter<Blob> | undefined;

  private importReader: ZipReader<Blob> | undefined;

  private importEntries: Entry[] = [];

  getBookList() {
    return Promise.resolve([]);
  }

  prepareBookForReading() {
    return Promise.resolve(0);
  }

  updateLastRead() {
    return Promise.resolve();
  }

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

  deleteBookData() {
    return Promise.resolve({ error: '', deleted: [] });
  }

  updateSettings(
    window: Window,
    saveBehavior: ReplicationSaveBehavior,
    statisticsMergeMode: MergeMode,
    readingGoalsMergeMode: MergeMode
  ) {
    this.window = window;
    this.saveBehavior = saveBehavior;
    this.statisticsMergeMode = statisticsMergeMode;
    this.readingGoalsMergeMode = readingGoalsMergeMode;
  }

  clearData(clearAll = true) {
    if (clearAll) {
      this.exportZipWriter = undefined;
      this.importReader = undefined;
      this.importEntries = [];
    }
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

  async getFilenameForRecentCheck(fileIdentifier: string) {
    if (this.saveBehavior === ReplicationSaveBehavior.Overwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    const { filename } = this.validRootFiles.includes(fileIdentifier)
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

    const bookBlob = await this.readFromZip(
      new BlobWriter(),
      'Unable to read book data',
      zipEntry,
      0.3
    );

    return this.extractBookData(bookBlob, filename, 0.6);
  }

  async getProgress() {
    const { zipEntry } = this.findEntry('progress_');

    if (!zipEntry) {
      return undefined;
    }

    return this.extractAsJSON(zipEntry, 'Unable to read progress data');
  }

  async getStatistics() {
    const { zipEntry, filename } = this.findEntry('statistics_');

    if (!zipEntry) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }

    const statistics = await this.extractAsJSON(zipEntry, 'Unable to read statistics');

    return {
      statistics,
      lastStatisticModified:
        BaseStorageHandler.getStatisticsMetadata(filename).lastStatisticModified
    };
  }

  async getCover() {
    if (this.currentContext.imagePath instanceof Blob) {
      BaseStorageHandler.reportProgress();

      return this.currentContext.imagePath;
    }

    const { zipEntry } = this.findEntry('cover_');

    if (!zipEntry) {
      return undefined;
    }

    const cover = await this.readFromZip(
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

    const readingGoals = await this.extractAsJSON(zipEntry, 'Unable to read reading goals');

    return {
      readingGoals,
      lastGoalModified: BaseStorageHandler.getReadingGoalsMetadata(filename).lastGoalModified
    };
  }

  async saveBook(data: Omit<BooksDbBookData, 'id'>) {
    const filename = `${this.sanitizedTitle}/${BaseStorageHandler.getBookFileName(data)}`;

    this.exportZipWriter = await this.addDataToZip(
      filename,
      await this.zipBookData(data, 0.5),
      this.exportZipWriter,
      0.5
    );

    return 0;
  }

  async saveProgress(data: BooksDbBookmarkData) {
    const filename = `${this.sanitizedTitle}/${BaseStorageHandler.getProgressFileName(data)}`;

    this.exportZipWriter = await this.addDataToZip(
      filename,
      JSON.stringify(data),
      this.exportZipWriter
    );
  }

  async saveStatistics(data: BooksDbStatistic[], lastStatisticModified: number) {
    const filename = `${this.sanitizedTitle}/${BaseStorageHandler.getStatisticsFileName(
      data,
      lastStatisticModified
    )}`;

    data.sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));

    this.exportZipWriter = await this.addDataToZip(
      filename,
      JSON.stringify(data),
      this.exportZipWriter
    );
  }

  async saveCover(data: Blob | undefined) {
    if (!data) {
      BaseStorageHandler.reportProgress();
      return;
    }

    const filename = await BaseStorageHandler.getCoverFileName(data);
    this.exportZipWriter = await this.addDataToZip(
      `${this.sanitizedTitle}/${filename}`,
      data,
      this.exportZipWriter
    );
  }

  async saveReadingGoals(data: BooksDbReadingGoal[], lastGoalModified: number) {
    const filename = `${BaseStorageHandler.getReadingGoalsFileName(lastGoalModified)}`;

    data.sort(readingGoalSortFunction);

    this.exportZipWriter = await this.addDataToZip(
      filename,
      JSON.stringify(data),
      this.exportZipWriter
    );
  }

  async saveAppSettings(json: string) {
    this.exportZipWriter = await this.addDataToZip(
      BackupStorageHandler.appSettingsFilename,
      json,
      this.exportZipWriter
    );
  }

  async getAppSettings(): Promise<Record<string, string> | undefined> {
    const rootFile = this.rootFiles.get(BackupStorageHandler.appSettingsFilename);
    const zipEntry = rootFile
      ? this.importEntries.find((e) => e.filename === rootFile.name)
      : undefined;
    if (!zipEntry) return undefined;
    return this.extractAsJSON(zipEntry, 'Unable to read app settings');
  }

  async saveReadingGoalState(json: string) {
    this.exportZipWriter = await this.addDataToZip(
      BackupStorageHandler.readingGoalStateFilename,
      json,
      this.exportZipWriter
    );
  }

  async getReadingGoalState(): Promise<Record<string, string> | undefined> {
    const rootFile = this.rootFiles.get(BackupStorageHandler.readingGoalStateFilename);
    const zipEntry = rootFile
      ? this.importEntries.find((e) => e.filename === rootFile.name)
      : undefined;
    if (!zipEntry) return undefined;
    return this.extractAsJSON(zipEntry, 'Unable to read reading-goal state');
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

  private findEntry(filePrefix: string, progressBase = 0.1) {
    const zipEntry = this.importEntries.find((entry) =>
      entry.filename.startsWith(`${this.sanitizedTitle}/${filePrefix}`)
    );

    BaseStorageHandler.reportProgress(progressBase);

    return { zipEntry, filename: zipEntry?.filename.replace(`${this.sanitizedTitle}/`, '') || '' };
  }

  private getRootFile(filePrefix: string, progressBase = 0.1) {
    const rootFile = this.rootFiles.get(filePrefix);
    const zipEntry = rootFile
      ? this.importEntries.find((entry) => entry.filename === rootFile.name)
      : undefined;

    BaseStorageHandler.reportProgress(progressBase);

    return { zipEntry, filename: zipEntry?.filename || '' };
  }
}
