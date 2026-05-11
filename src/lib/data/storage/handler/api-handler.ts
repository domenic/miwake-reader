import type {
  BooksDbBookData,
  BooksDbBookmarkData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import { logger } from '$lib/data/logger';
import { mergeReadingGoals, readingGoalSortFunction } from '$lib/data/reading-goal';
import {
  BaseScopedHandler,
  BaseStorageHandler,
  type ExternalFile
} from '$lib/data/storage/handler/base-handler';
import type { ScopedBookOperations, ScopedSettings } from '$lib/data/storage/handler/handler-roles';
import { StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import {
  convertAuthErrorResponse,
  handleErrorDuringReplication
} from '$lib/functions/replication/error-handler';
import { AbortError, throwIfAborted } from '$lib/functions/replication/replication-error';
import {
  replicationProgress$,
  type ReplicationContext
} from '$lib/functions/replication/replication-progress';
import { mergeStatistics, updateStatisticToStore } from '$lib/functions/statistic-util';
import pLimit from 'p-limit';

export interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: XMLHttpRequestBodyInit | null | undefined;
  trackDownload?: boolean;
  trackUpload?: boolean;
  skipAuth?: boolean;
}

/**
 * `title` keys the per-book file cache after a successful upload.
 * When `rootFilePrefix` is set the upload is a root-level file (not
 * tied to a book); `title` is ignored in that branch.
 */
export interface UploadOptions {
  folderId: string;
  name: string;
  files: ExternalFile[];
  externalFile: ExternalFile | undefined;
  data: Blob | string | undefined;
  title: string;
  rootFilePrefix?: string;
  progressBase?: number;
  cancelSignal?: AbortSignal;
}

export abstract class ApiStorageHandler extends BaseStorageHandler {
  /** @internal Subclass hook: react to a storageSourceName change. */
  abstract setInternalSettings(storageSourceName: string): void;

  /** @internal Used by `ScopedApiHandler` to locate the per-book folder. */
  abstract ensureTitle(name?: string, parent?: string, readOnly?: boolean): Promise<string>;

  /** @internal Used by `ScopedApiHandler` to populate / read the per-title file cache. */
  abstract getExternalFiles(remoteTitleId: string, title: string): Promise<ExternalFile[]>;

  /** @internal Used by `ScopedApiHandler` to populate / read the root file cache. */
  abstract setRootFiles(): Promise<void>;

  /** @internal Used by `ScopedApiHandler` to download a single file. */
  abstract retrieve(
    file: ExternalFile,
    typeToRetrieve: XMLHttpRequestResponseType,
    progressBase?: number,
    cancelSignal?: AbortSignal
  ): Promise<any>;

  /** @internal Used by `ScopedApiHandler` to upload a single file. */
  abstract upload(opts: UploadOptions): Promise<ExternalFile>;

  protected abstract executeDelete(id: string, cancelSignal?: AbortSignal): Promise<void>;

  protected authManager: StorageOAuthManager;

  /** @internal Used by `ScopedApiHandler` and subclass impls. */
  rootId = '';

  /** @internal Used by `ScopedApiHandler` and subclass impls. */
  titleToId = new Map<string, string>();

  /** @internal Used by `ScopedApiHandler` and subclass impls. */
  titleToFiles = new Map<string, ExternalFile[]>();

  constructor(storageType: SyncEndpointType, window: Window, refreshEndpoint: string) {
    super(window, storageType);
    this.authManager = new StorageOAuthManager(this.storageType, refreshEndpoint);
  }

  updateSettings(
    window: Window,
    cacheStorageData: boolean,
    _askForStorageUnlock: boolean,
    storageSourceName: string
  ) {
    this.window = window;
    this.cacheStorageData = cacheStorageData;
    this.setInternalSettings(storageSourceName);
  }

  /**
   * Force an OAuth exchange.
   *
   * With an `authWindow`: used by source-manager's connectCloud — the
   * popup is opened synchronously inside the user's click handler,
   * then this method navigates it to the OAuth flow.
   *
   * With `silentOnly: true`: used by the sync engine on app boot /
   * ambient operations. Tries the cached/refreshable token path; if
   * that fails, throws `NeedsInteractiveAuthError` instead of opening
   * a popup (which would be blocked anyway without a user gesture).
   */
  async authenticate(authWindow: Window | null, silentOnly = false): Promise<void> {
    await this.authManager.getToken(this.window, this.storageSourceName, authWindow, silentOnly);
  }

  clearData(clearAll = true) {
    this.titleToFiles.clear();
    this.rootFiles.clear();
    this.rootFileListFetched = false;

    if (clearAll) {
      this.rootId = '';
      this.titleToId.clear();
      this.titleToBookCard.clear();
      this.dataListFetched = false;
    }
  }

  scoped(
    context: ReplicationContext,
    settings: ScopedSettings,
    cancelSignal?: AbortSignal
  ): ScopedBookOperations {
    return new ScopedApiHandler(this, context, settings, cancelSignal);
  }

  async deleteBookData(booksToDelete: string[], cancelSignal: AbortSignal) {
    await this.ensureTitle();

    let error = '';

    const deleted: number[] = [];
    const deletionLimiter = pLimit(1);
    const deleteTasks: Promise<void>[] = [];

    replicationProgress$.next({ progressBase: 1, maxProgress: booksToDelete.length });

    booksToDelete.forEach((bookToDelete) =>
      deleteTasks.push(
        deletionLimiter(async () => {
          try {
            throwIfAborted(cancelSignal);

            const externalId = this.titleToId.get(bookToDelete);

            if (externalId) {
              await this.executeDelete(externalId, cancelSignal);
            }

            this.titleToFiles.delete(bookToDelete);

            const deletedBookCard = this.titleToBookCard.get(bookToDelete);

            if (deletedBookCard) {
              deleted.push(deletedBookCard.id);
            }

            this.titleToId.delete(bookToDelete);
            this.titleToBookCard.delete(bookToDelete);

            database.dataListChanged$.next();

            BaseStorageHandler.reportProgress();
          } catch (err) {
            error = handleErrorDuringReplication(err, `Error deleting ${bookToDelete}: `, [
              deletionLimiter
            ]);
          }
        })
      )
    );

    await Promise.all(deleteTasks).catch(() => {});

    return { error, deleted };
  }

  /** @internal Shared XHR plumbing for subclass `retrieve`/`upload`/etc. */
  async request(
    url: string,
    options: RequestOptions = {},
    type: XMLHttpRequestResponseType = 'json',
    progressBase = 1,
    cancelSignal?: AbortSignal
  ): Promise<any> {
    const token = await (options.skipAuth
      ? Promise.resolve('')
      : this.authManager.getToken(this.window, this.storageSourceName));

    let abortHandler: (() => void) | undefined;
    try {
      return await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        xhr.responseType = type;

        xhr.addEventListener('abort', () => {
          reject(new AbortError());
        });

        // Wire cancelSignal directly to xhr.abort() so requests that
        // don't emit progress events (small bodies, DELETE) are still
        // cancellable mid-flight.
        if (cancelSignal) {
          if (cancelSignal.aborted) {
            xhr.abort();
            return;
          }
          abortHandler = () => xhr.abort();
          cancelSignal.addEventListener('abort', abortHandler);
        }

        if (options.trackDownload) {
          const report = BaseStorageHandler.makeProgressReporter(progressBase);
          xhr.onprogress = (event) => {
            if (event.lengthComputable) report(event.loaded, event.total);
          };
        }

        if (options.trackUpload) {
          const report = BaseStorageHandler.makeProgressReporter(progressBase);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) report(event.loaded, event.total);
          };
        }

        xhr.addEventListener(
          'readystatechange',
          async function stateHandler() {
            if (this.readyState === 4) {
              if (this.status >= 200 && this.status < 400) {
                resolve(this.response);
              } else {
                const errorMessage = await convertAuthErrorResponse(this);

                if (this.status === 404) {
                  logger.error(errorMessage);
                  reject(new Error('Resource not found. Refresh your current tab and try again'));
                } else {
                  reject(new Error(errorMessage));
                }
              }
            }
          },
          false
        );

        xhr.open(options.method || 'GET', url, true);

        if (options.headers) {
          const entries = Object.entries(options.headers);

          for (let index = 0, { length } = entries; index < length; index += 1) {
            const [headerName, headerValue] = entries[index];

            xhr.setRequestHeader(headerName, headerValue);
          }
        }

        if (token) {
          xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        }

        xhr.send(options.body || null);
      });
    } finally {
      if (abortHandler && cancelSignal) {
        // Always remove — long-lived signals (force-resync) accumulate
        // listeners otherwise. AbortSignal doesn't auto-clean.
        cancelSignal.removeEventListener('abort', abortHandler);
      }
    }
  }

  /** @internal Subclass hook: record the result of a successful upload. */
  updateAfterUpload(
    title: string,
    id: string,
    name: string,
    files: ExternalFile[],
    remoteFile: ExternalFile | undefined,
    extraData = {},
    rootFilePrefix?: string
  ) {
    if (rootFilePrefix) {
      this.rootFiles.set(rootFilePrefix, { id, name });
    } else if (remoteFile) {
      const titleFiles = files.map((file) => {
        const updatedFile = file;
        if (file.name === remoteFile.name) {
          updatedFile.name = name;
        }

        return updatedFile;
      });

      this.titleToFiles.set(title, titleFiles);
    } else {
      files.push({ id, name, ...extraData });

      this.titleToFiles.set(title, files);
    }
  }
}

export class ScopedApiHandler
  extends BaseScopedHandler<ApiStorageHandler>
  implements ScopedBookOperations
{
  async getFilenameForRecentCheck(fileIdentifier: string) {
    if (this.isOverwrite) {
      BaseStorageHandler.reportProgress();
      return undefined;
    }

    const { file } = this.handler.validRootFiles.includes(fileIdentifier)
      ? await this.getRootFile(fileIdentifier)
      : await this.getExternalFile(fileIdentifier);

    BaseStorageHandler.completeStep();

    return file?.name;
  }

  async isBookPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getExternalFile('bookdata_');

    let isPresentAndUpToDate = false;

    if (file) {
      const { lastBookModified, lastBookOpen } =
        BaseStorageHandler.getBookMetadata(referenceFilename);
      const { lastBookModified: existingBookModified, lastBookOpen: existingBookOpen } =
        BaseStorageHandler.getBookMetadata(file.name);

      isPresentAndUpToDate = !!(
        existingBookModified &&
        lastBookModified &&
        existingBookModified >= lastBookModified &&
        (existingBookOpen || 0) >= (lastBookOpen || 0)
      );
    }

    BaseStorageHandler.completeStep();

    return isPresentAndUpToDate;
  }

  async isProgressPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getExternalFile('progress_');

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getProgressMetadata,
      'lastBookmarkModified',
      referenceFilename,
      file?.name
    );
  }

  async areStatisticsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getExternalFile('statistics_');

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getStatisticsMetadata,
      'lastStatisticModified',
      referenceFilename,
      file?.name
    );
  }

  async areReadingGoalsPresentAndUpToDate(referenceFilename: string | undefined) {
    if (!referenceFilename) {
      BaseStorageHandler.reportProgress();
      return false;
    }

    const { file } = await this.getRootFile(BaseStorageHandler.readingGoalsFilePrefix);

    return BaseStorageHandler.checkIsPresentAndUpToDate(
      BaseStorageHandler.getReadingGoalsMetadata,
      'lastGoalModified',
      referenceFilename,
      file?.name
    );
  }

  async getBook() {
    const { file, data } = await this.getExternalFile('bookdata_', 'blob', 0.7);

    if (!file) {
      return undefined;
    }

    return BaseStorageHandler.extractBookData(data, file.name, {
      progressBase: 0.3,
      cancelSignal: this.cancelSignal
    });
  }

  async getProgress() {
    const { file, data } = await this.getExternalFile('progress_', 'json');

    if (!file) {
      return undefined;
    }

    return data;
  }

  async getStatistics() {
    const { file, data } = await this.getExternalFile('statistics_', 'json');

    if (!file) {
      return { statistics: undefined, lastStatisticModified: 0 };
    }

    return {
      statistics: data,
      lastStatisticModified: BaseStorageHandler.getStatisticsMetadata(file.name)
        .lastStatisticModified
    };
  }

  async getCover() {
    if (this.context.imagePath instanceof Blob) {
      BaseStorageHandler.reportProgress();

      return this.context.imagePath;
    }

    const { data } = await this.getExternalFile('cover_', 'blob');

    return data;
  }

  async getReadingGoals() {
    const { file, data } = await this.getRootFile(
      BaseStorageHandler.readingGoalsFilePrefix,
      'json'
    );

    if (!file) {
      return { readingGoals: undefined, lastGoalModified: 0 };
    }

    return {
      readingGoals: data,
      lastGoalModified: BaseStorageHandler.getReadingGoalsMetadata(file.name).lastGoalModified
    };
  }

  async saveBook(data: Omit<BooksDbBookData, 'id'>, skipTimestampFallback = true) {
    const { titleId, files, file } = await this.getExternalFile('bookdata_', '', 0.2, false);
    const filename = BaseStorageHandler.getBookFileName(
      data,
      skipTimestampFallback ? '' : file?.name
    );
    const { characters, lastBookModified, lastBookOpen } =
      BaseStorageHandler.getBookMetadata(filename);

    if (file && this.isNewOnly) {
      const { lastBookModified: existingBookModified, lastBookOpen: existingBookOpen } =
        BaseStorageHandler.getBookMetadata(file.name);

      if (
        existingBookModified &&
        lastBookModified &&
        existingBookModified >= lastBookModified &&
        (existingBookOpen || 0) >= (lastBookOpen || 0)
      ) {
        return 0;
      }
    }

    const zipped = await BaseStorageHandler.zipBookData(data, {
      progressBase: 0.2,
      cancelSignal: this.cancelSignal
    });

    await this.handler.upload({
      folderId: titleId,
      name: filename,
      files,
      externalFile: file,
      data: zipped,
      progressBase: 0.6,
      cancelSignal: this.cancelSignal,
      title: this.title
    });

    this.handler.addBookCard(this.title, { characters, lastBookModified, lastBookOpen });

    return 0;
  }

  async saveProgress(data: BooksDbBookmarkData) {
    const filename = BaseStorageHandler.getProgressFileName(data);
    const { titleId, files, file } = await this.getExternalFile('progress_', '', 0.2, false);
    const { lastBookmarkModified, progress, completed } =
      BaseStorageHandler.getProgressMetadata(filename);

    await this.handler.upload({
      folderId: titleId,
      name: filename,
      files,
      externalFile: file,
      data: JSON.stringify(data),
      cancelSignal: this.cancelSignal,
      title: this.title
    });

    this.handler.addBookCard(this.title, { lastBookmarkModified, progress, completed });
  }

  async saveStatistics(statistics: BooksDbStatistic[], lastStatisticModified: number) {
    const isMerge = this.settings.statisticsMergeMode === 'merge';
    const {
      titleId,
      files,
      file,
      data: existingData
    } = await this.getExternalFile('statistics_', isMerge ? 'json' : '', 0.2, false);

    let statisticsToStore: BooksDbStatistic[] = statistics;
    let newStatisticModified = lastStatisticModified;

    if (isMerge) {
      statisticsToStore = mergeStatistics(statistics, existingData, this.isNewOnly);
    }

    ({ statisticsToStore, newStatisticModified } = updateStatisticToStore(
      statisticsToStore,
      newStatisticModified
    ));

    const filename = BaseStorageHandler.getStatisticsFileName(
      statisticsToStore,
      newStatisticModified
    );

    await this.handler.upload({
      folderId: titleId,
      name: filename,
      files,
      externalFile: file,
      data: JSON.stringify(statisticsToStore),
      cancelSignal: this.cancelSignal,
      title: this.title
    });

    this.handler.addBookCard(this.title, {});
  }

  async saveCover(data: Blob | undefined) {
    if (!data) {
      BaseStorageHandler.reportProgress();
      return;
    }

    const { titleId, files, file } = await this.getExternalFile('cover_', '', 0.2, false);

    if (!file?.id) {
      const filename = await BaseStorageHandler.getCoverFileName(data);

      await this.handler.upload({
        folderId: titleId,
        name: filename,
        files,
        externalFile: undefined,
        data,
        cancelSignal: this.cancelSignal,
        title: this.title
      });
    }

    if (this.handler.titleToBookCard.has(this.title)) {
      this.handler.addBookCard(this.title, { imagePath: data });
    }
  }

  async saveReadingGoals(readingGoals: BooksDbReadingGoal[], lastGoalModified: number) {
    const isMerge = this.settings.readingGoalsMergeMode === 'merge';
    const { file, data: existingData } = await this.getRootFile(
      BaseStorageHandler.readingGoalsFilePrefix,
      isMerge ? 'json' : '',
      0.2
    );

    let readingGoalsToStore: BooksDbReadingGoal[] = readingGoals;
    let newReadingGoalModified = lastGoalModified;

    if (isMerge) {
      ({ readingGoalsToStore, newReadingGoalModified } = mergeReadingGoals(
        readingGoals,
        existingData,
        this.isNewOnly,
        lastGoalModified
      ));
    }

    const filename = BaseStorageHandler.getReadingGoalsFileName(newReadingGoalModified);

    readingGoalsToStore.sort(readingGoalSortFunction);

    await this.handler.upload({
      folderId: this.handler.rootId,
      name: filename,
      files: [],
      externalFile: file,
      data: JSON.stringify(readingGoalsToStore),
      rootFilePrefix: BaseStorageHandler.readingGoalsFilePrefix,
      cancelSignal: this.cancelSignal,
      title: ''
    });
  }

  private async getExternalFile(
    fileIdentifier: string,
    typeToRetrieve: XMLHttpRequestResponseType = '',
    progressBase = 1,
    readOnly = true
  ) {
    const progressPerStep = progressBase / 5;

    await this.handler.ensureTitle();

    BaseStorageHandler.reportProgress(progressPerStep);

    const titleId = await this.handler.ensureTitle(this.title, this.handler.rootId, readOnly);

    BaseStorageHandler.reportProgress(progressPerStep);

    if (!titleId) {
      return { titleId: '', file: undefined, files: [], data: undefined };
    }

    const files = await this.handler.getExternalFiles(titleId, this.title);
    const file = files.find((entry) => entry.name.startsWith(fileIdentifier));

    BaseStorageHandler.reportProgress(progressPerStep);

    if (!file) {
      return { titleId, file: undefined, files, data: undefined };
    }

    let data;

    if (typeToRetrieve) {
      data = await this.handler.retrieve(
        file,
        typeToRetrieve,
        progressPerStep * 2,
        this.cancelSignal
      );
    }

    return { titleId, file, files, data };
  }

  private async getRootFile(
    fileIdentifier: string,
    typeToRetrieve: XMLHttpRequestResponseType = '',
    progressBase = 1
  ) {
    const progressPerStep = progressBase / 3;

    await this.handler.ensureTitle();

    BaseStorageHandler.reportProgress(progressPerStep);

    await this.handler.setRootFiles();

    const file = this.handler.rootFiles.get(fileIdentifier);

    BaseStorageHandler.reportProgress(progressPerStep);

    if (!file) {
      return { file: undefined, data: undefined };
    }

    let data;

    if (typeToRetrieve) {
      data = await this.handler.retrieve(file, typeToRetrieve, progressPerStep, this.cancelSignal);
    }

    return { file, data };
  }
}
