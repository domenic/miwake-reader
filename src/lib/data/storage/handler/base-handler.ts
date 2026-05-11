import type { BookCardProps } from '$lib/components/book-card/book-card-props';
import {
  currentDbVersion,
  type BooksDbBookData,
  type BooksDbBookmarkData,
  type BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import type { Section } from '$lib/data/database/books-db/versions/v4/books-db-v4';
import { storageRootName } from '$lib/data/env';
import type { SyncEndpointType, SyncTitle } from '$lib/data/storage/storage-types';
import type {
  ScopedBookOperations,
  ScopedSettings,
  SyncEndpoint
} from '$lib/data/storage/handler/handler-roles';
import { exporterVersion } from '$lib/functions/replication/exporter-version';
import { throwIfAborted } from '$lib/functions/replication/replication-error';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import {
  replicationProgress$,
  type ReplicationContext,
  type ReplicationDeleteResult
} from '$lib/functions/replication/replication-progress';
import pLimit from 'p-limit';
import {
  BlobReader,
  BlobWriter,
  TextReader,
  TextWriter,
  ZipReader,
  ZipWriter,
  type Entry
} from '@zip.js/zip.js';

export interface ExternalFile {
  id: string;
  name: string;
}

export interface ZipOpOptions {
  progressBase?: number;
  cancelSignal?: AbortSignal;
}

/**
 * Shared chassis for sync-endpoint implementations (cloud / FS /
 * backup). Owns the long-lived state for a given storage source —
 * source name, fetched-listing caches, network clients — plus the
 * static ZIP / file-name helpers every endpoint needs.
 *
 * Per-call state (which book, which save-behavior, which cancel
 * signal) lives on the matching `ScopedBookOperations` class returned
 * by `scoped()` — typically `Scoped<X>Handler extends
 * BaseScopedHandler<X>`. NOT extended by `LocalReplicationEndpoint`,
 * which has its own (Local + ScopedLocal) pair.
 */
export abstract class BaseStorageHandler implements SyncEndpoint {
  readonly kind = 'sync-endpoint' as const;

  /**
   * Enumerate the titles this source holds, for placeholder seeding
   * and reachable-set computation. Cloud and filesystem return real
   * data; BROWSER and backup return [] (the unified library view
   * doesn't go through this method — it reads IndexedDB directly).
   */
  abstract listSyncTitles(opts?: { refresh?: boolean }): Promise<SyncTitle[]>;

  abstract authenticate(authWindow: Window | null, silentOnly?: boolean): Promise<void>;

  abstract clearData(clearAll?: boolean): void;

  abstract deleteBookData(
    booksToDelete: string[],
    cancelSignal: AbortSignal,
    keepLocalStatistics: boolean
  ): Promise<ReplicationDeleteResult>;

  /**
   * Bind a (context, settings) pair to this handler for a sequence of
   * per-book operations. Each call returns a fresh scoped object that
   * owns its own per-call state — handlers themselves are scope-free,
   * so concurrent scopes don't trample each other.
   */
  abstract scoped(
    context: ReplicationContext,
    settings: ScopedSettings,
    cancelSignal?: AbortSignal
  ): ScopedBookOperations;

  static rootName = storageRootName;

  static readingGoalsFilePrefix = 'miwake-user-goals_';

  storageType: SyncEndpointType;

  protected window: Window;

  protected storageSourceName = '';

  protected cacheStorageData = false;

  /** @internal Read/written by `BaseScopedHandler` subclasses and the handler. */
  dataListFetched = false;

  /** @internal Read/written by `BaseScopedHandler` subclasses and the handler. */
  rootFileListFetched = false;

  /** @internal Used by `BaseScopedHandler` subclasses; not for outside callers. */
  titleToBookCard = new Map<string, BookCardProps>();

  /** @internal Used by `BaseScopedHandler` subclasses; not for outside callers. */
  rootFiles = new Map<string, ExternalFile>();

  /** @internal Used by `BaseScopedHandler` subclasses; not for outside callers. */
  validRootFiles = [BaseStorageHandler.readingGoalsFilePrefix];

  constructor(window: Window, storageType: SyncEndpointType) {
    this.window = window;
    this.storageType = storageType;
  }

  isCacheDisabled() {
    return !this.cacheStorageData;
  }

  /** @internal Used by `BaseScopedHandler` subclasses. */
  addBookCard(title: string, dataToAdd: Record<string, any>) {
    const bookCard: BookCardProps = {
      ...(this.titleToBookCard.get(title) || {
        id: BaseStorageHandler.getDummyId(),
        title,
        imagePath: '',
        characters: 0,
        lastBookModified: 0,
        lastBookOpen: 0,
        progress: 0,
        completed: false,
        lastBookmarkModified: 0,
        isPlaceholder: false
      }),
      ...dataToAdd
    };

    this.titleToBookCard.set(title, bookCard);
  }

  /** @internal Used by `BaseScopedHandler` subclasses. */
  setRootFile(filename: string, file: ExternalFile) {
    for (let index = 0, { length } = this.validRootFiles; index < length; index += 1) {
      const validRootFile = this.validRootFiles[index];

      if (filename.startsWith(validRootFile)) {
        this.rootFiles.set(validRootFile, file);
      }
    }
  }

  static getBookCharacters(characterAmount: number, sections: Section[]) {
    if (characterAmount) {
      return characterAmount;
    }

    const lastSection = [...sections]
      .reverse()
      .find((section) => section.startCharacter !== undefined && section.characters !== undefined);

    let characters = 0;

    if (lastSection?.startCharacter && lastSection.characters) {
      characters = lastSection.startCharacter + lastSection.characters;
    }

    return characters;
  }

  static reportProgress(progressToAdd = 1) {
    replicationProgress$.next({ progressToAdd });
  }

  static completeStep() {
    replicationProgress$.next({ completeStep: true });
  }

  static getStatisticsMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastStatisticModified: +parts[3],
      charactersRead: +parts[4],
      readingTime: +parts[5],
      minReadingSpeed: +parts[6],
      altMinReadingSpeed: +parts[7],
      lastReadingSpeed: +parts[8],
      maxReadingSpeed: +parts[9],
      averageReadingTime: +parts[10],
      averageWeightedRedingTime: +parts[11],
      averageCharactersRead: +parts[12],
      averageWeightedCharatersRead: +parts[13],
      averageReadingSpeed: +parts[14],
      averageWeightedReadingSpeed: +parts[15],
      finishDate: parts[16] || 'na'
    };
  }

  static getStatisticsFileName(statistics: BooksDbStatistic[], lastStatisticModified: number) {
    let readingTime = 0;
    let charactersRead = 0;
    let minReadingSpeed = 0;
    let altMinReadingSpeed = 0;
    let maxReadingSpeed = 0;
    let weightedSum = 0;
    let validReadingDays = 0;
    let finishDate = 'na';

    for (let index = 0, { length } = statistics; index < length; index += 1) {
      const statistic = statistics[index];

      readingTime += statistic.readingTime;
      charactersRead += statistic.charactersRead;
      minReadingSpeed = minReadingSpeed
        ? Math.min(minReadingSpeed, statistic.minReadingSpeed)
        : statistic.minReadingSpeed;
      altMinReadingSpeed = altMinReadingSpeed
        ? Math.min(altMinReadingSpeed, statistic.altMinReadingSpeed)
        : statistic.altMinReadingSpeed;
      maxReadingSpeed = Math.max(maxReadingSpeed, statistic.lastReadingSpeed);
      weightedSum += statistic.readingTime * statistic.charactersRead;

      if (statistic.readingTime) {
        validReadingDays += 1;
      }

      if (statistic.completedData) {
        if (finishDate === 'na') {
          finishDate = statistic.dateKey;
        } else {
          finishDate =
            statistic.completedData.dateKey > finishDate
              ? statistic.completedData.dateKey
              : finishDate;
        }
      }
    }

    const averageReadingTime = validReadingDays ? Math.ceil(readingTime / validReadingDays) : 0;
    const averageWeightedReadingTime = charactersRead ? Math.ceil(weightedSum / charactersRead) : 0;
    const averageCharactersRead = validReadingDays
      ? Math.ceil(charactersRead / validReadingDays)
      : 0;
    const averageWeightedCharactersRead = readingTime ? Math.ceil(weightedSum / readingTime) : 0;
    const lastReadingSpeed = readingTime ? Math.ceil((3600 * charactersRead) / readingTime) : 0;
    const averageReadingSpeed = averageReadingTime
      ? Math.ceil((3600 * averageCharactersRead) / averageReadingTime)
      : 0;
    const averageWeightedReadingSpeed = averageWeightedReadingTime
      ? Math.ceil((3600 * averageWeightedCharactersRead) / averageWeightedReadingTime)
      : 0;

    return `statistics_${exporterVersion}_${currentDbVersion}_${lastStatisticModified}_${charactersRead}_${readingTime}_${minReadingSpeed}_${altMinReadingSpeed}_${lastReadingSpeed}_${maxReadingSpeed}_${averageReadingTime}_${averageWeightedReadingTime}_${averageCharactersRead}_${averageWeightedCharactersRead}_${averageReadingSpeed}_${averageWeightedReadingSpeed}_${finishDate}.json`;
  }

  static getReadingGoalsFileName(lastGoalModified: number) {
    return `${BaseStorageHandler.readingGoalsFilePrefix}${exporterVersion}_${currentDbVersion}_${lastGoalModified}.json`;
  }

  static getImageMimeTypeFromExtension(value: string) {
    const extension = value.split('.').pop()?.toLowerCase() || '';

    switch (extension) {
      case 'svg':
        return `image/svg+xml`;
      case 'png':
      case 'gif':
      case 'bmp':
      case 'webp':
        return `image/${extension}`;
      default:
        return 'image/jpeg';
    }
  }

  static checkIsPresentAndUpToDate<T>(
    functionToCall: (_: string) => any,
    keyToCheck: keyof T,
    referenceFilename: string,
    name?: string
  ) {
    let isPresentAndUpToDate = false;

    if (name) {
      const lastModifiedValue = functionToCall(referenceFilename)[keyToCheck];
      const existingLastModifiedValue = functionToCall(name)[keyToCheck];

      isPresentAndUpToDate = !!(
        existingLastModifiedValue &&
        lastModifiedValue &&
        existingLastModifiedValue >= lastModifiedValue
      );
    }

    BaseStorageHandler.completeStep();

    return isPresentAndUpToDate;
  }

  static async zipBookData(
    bookdata: Omit<BooksDbBookData, 'id'>,
    options: ZipOpOptions = {}
  ): Promise<Blob> {
    const { progressBase = 1, cancelSignal } = options;
    const zipWriter = new ZipWriter(new BlobWriter('application/zip'));
    const blobsToZip = [];
    const blobEntries = [...Object.entries(bookdata.blobs)];
    const staticDataToZip: Array<
      Exclude<
        keyof Omit<BooksDbBookData, 'id'>,
        'blobs' | 'hasThumb' | 'coverImage' | 'characters' | 'lastBookModified' | 'lastBookOpen'
      >
    > = ['title', 'styleSheet', 'elementHtml', 'htmlBackup', 'sections'];
    const staticData: Record<string, string | Section[] | undefined> = {};
    const limiter = pLimit(1);
    const cover = bookdata.coverImage;
    const isBlobCover = cover instanceof Blob;
    const filesInScope = blobEntries.length + staticDataToZip.length + (isBlobCover ? 1 : 0);
    const progressPerStep = progressBase / filesInScope;

    for (let index = 0, { length } = blobEntries; index < length; index += 1) {
      blobsToZip.push(
        limiter(async () => {
          const [name, blob] = blobEntries[index];

          await BaseStorageHandler.addDataToZip(`blobs/${name}`, blob, zipWriter, {
            progressBase: progressPerStep,
            cancelSignal
          }).catch((error) => {
            limiter.clearQueue();
            throw error;
          });
        })
      );
    }

    await Promise.all(blobsToZip);

    if (isBlobCover) {
      await BaseStorageHandler.addDataToZip(
        `cover.${await BaseStorageHandler.determineImageExtension(cover)}`,
        cover,
        zipWriter,
        { progressBase: progressPerStep, cancelSignal }
      );
    }

    for (let index = 0, { length } = staticDataToZip; index < length; index += 1) {
      throwIfAborted(cancelSignal);

      const dataProperty = staticDataToZip[index];

      staticData[dataProperty] = bookdata[dataProperty];
    }

    if (Object.keys(staticData).length) {
      await BaseStorageHandler.addDataToZip(
        'staticdata.json',
        JSON.stringify(staticData),
        zipWriter,
        {
          progressBase: progressPerStep,
          cancelSignal
        }
      );
    }

    return zipWriter.close();
  }

  static async addDataToZip(
    name: string,
    data: string | Blob,
    writer: ZipWriter<Blob> | undefined,
    options: ZipOpOptions = {}
  ): Promise<ZipWriter<Blob>> {
    const { progressBase = 1, cancelSignal } = options;
    throwIfAborted(cancelSignal);

    const zipWriter = writer || new ZipWriter(new BlobWriter('application/zip'));

    let last = 0;
    const onprogress = async (progress: number, total: number) => {
      if (!progressBase || !total) return;
      const next = progress / total;
      const delta = next - last;
      last = next;
      BaseStorageHandler.reportProgress(delta * progressBase);
    };

    if (data instanceof Blob) {
      await zipWriter.add(name, new BlobReader(data), { onprogress });
    } else if (data) {
      await zipWriter.add(name, new TextReader(data), { onprogress });
    }

    return zipWriter;
  }

  static async readFromZip(
    writer: BlobWriter,
    errorForNoRead: string,
    retrievedData: Entry,
    progressBase?: number
  ): Promise<Blob>;
  static async readFromZip(
    writer: TextWriter,
    errorForNoRead: string,
    retrievedData: Entry,
    progressBase?: number
  ): Promise<string>;
  static async readFromZip(
    writer: BlobWriter | TextWriter,
    errorForNoRead: string,
    retrievedData: Entry,
    progressBase = 1
  ): Promise<Blob | string> {
    if (retrievedData.directory) {
      throw new Error(errorForNoRead);
    }

    let last = 0;
    const onprogress = async (progress: number, total: number) => {
      if (!progressBase || !total) return;
      const next = progress / total;
      const delta = next - last;
      last = next;
      BaseStorageHandler.reportProgress(delta * progressBase);
    };

    const zipData = await retrievedData.getData(writer, { onprogress });

    if (!zipData) {
      throw new Error(errorForNoRead);
    }

    return zipData;
  }

  static async extractBookData(book: Blob, filename: string, options: ZipOpOptions = {}) {
    const { progressBase = 1, cancelSignal } = options;
    const bookreader = new ZipReader(new BlobReader(book));
    const bookDataEntries = await bookreader.getEntries();

    if (!bookDataEntries.length) {
      BaseStorageHandler.reportProgress(progressBase);

      return undefined;
    }

    const bookObject: Omit<BooksDbBookData, 'id'> = {
      title: '',
      styleSheet: '',
      elementHtml: '',
      blobs: {} as Record<string, Blob>,
      coverImage: '',
      hasThumb: true,
      characters: 0,
      sections: [],
      lastBookModified: 0,
      lastBookOpen: 0
    };

    const bookObjectTransforms = [];
    const limiter = pLimit(1);
    const progressPerStep = progressBase / bookDataEntries.length;

    for (let index = 0, { length } = bookDataEntries; index < length; index += 1) {
      bookObjectTransforms.push(
        limiter(async () => {
          try {
            throwIfAborted(cancelSignal);

            const entry = bookDataEntries[index];

            if (entry.filename === 'staticdata.json') {
              const staticData = JSON.parse(
                await BaseStorageHandler.readFromZip(
                  new TextWriter(),
                  'Unable to read Static Data',
                  entry,
                  progressPerStep
                )
              ) as Omit<
                BooksDbBookData,
                'id' | 'blobs' | 'hasThumb' | 'coverImage' | 'lastBookModified' | 'lastBookOpen'
              >;

              if (!staticData.elementHtml) {
                throw new Error(`Invalid bookdata - empty element html`);
              }

              const { characters, lastBookModified, lastBookOpen } =
                BaseStorageHandler.getBookMetadata(filename);

              bookObject.title = staticData.title;
              bookObject.elementHtml = staticData.elementHtml;
              bookObject.styleSheet = staticData.styleSheet || '';
              bookObject.sections = staticData.sections || [];
              bookObject.characters = BaseStorageHandler.getBookCharacters(
                characters || 0,
                bookObject.sections
              );
              bookObject.lastBookModified = lastBookModified;
              bookObject.lastBookOpen = lastBookOpen;

              if (staticData.htmlBackup) {
                bookObject.htmlBackup = staticData.htmlBackup;
              }
            } else if (entry.filename.startsWith('blobs/')) {
              const imagePath = entry.filename.replace('blobs/', '');
              const existingBlobEntries = bookObject.blobs || {};

              existingBlobEntries[imagePath] = await BaseStorageHandler.readFromZip(
                new BlobWriter(BaseStorageHandler.getImageMimeTypeFromExtension(imagePath)),
                'Unable to read blob data',
                entry,
                progressPerStep
              );
              bookObject.blobs = existingBlobEntries;
            } else if (entry.filename.startsWith('cover.')) {
              bookObject.coverImage = await BaseStorageHandler.readFromZip(
                new BlobWriter(BaseStorageHandler.getImageMimeTypeFromExtension(entry.filename)),
                'Unable to read cover data',
                entry,
                progressPerStep
              );
            }
          } catch (error) {
            limiter.clearQueue();
            throw error;
          }
        })
      );
    }

    await Promise.all(bookObjectTransforms);

    return bookObject;
  }

  static async extractAsJSON(entry: Entry, errorMessage: string, progressBase = 0.9) {
    if (!entry || entry.directory) {
      return undefined;
    }

    const jsonData = JSON.parse(
      await BaseStorageHandler.readFromZip(new TextWriter(), errorMessage, entry, progressBase)
    );

    return jsonData;
  }

  static getDummyId() {
    return Math.floor(Date.now() * Math.random());
  }

  static sanitizeForFilename(title: string) {
    return title
      .replace(/[ ]$/, '~ttu-spc~')
      .replace(/[.]$/, '~ttu-dend~')
      .replace(/\*/g, '~ttu-star~')
      .replace(/[/?<>\\:*|%"]/g, (match) => encodeURIComponent(match));
  }

  static desanitizeFilename(title: string) {
    return decodeURIComponent(title)
      .replaceAll('~ttu-star~', '*')
      .replaceAll('~ttu-dend~', '.')
      .replaceAll('~ttu-spc~', ' ');
  }

  static getBookFileName(book: Omit<BooksDbBookData, 'id'> | File, existingFilename?: string) {
    if (book instanceof File) {
      return book.name;
    }

    if (existingFilename) {
      const { characters, lastBookModified, lastBookOpen } =
        BaseStorageHandler.getBookMetadata(existingFilename);

      return `bookdata_${exporterVersion}_${currentDbVersion}_${
        characters ||
        BaseStorageHandler.getBookCharacters(book.characters || 0, book.sections || [])
      }_${book.lastBookModified || lastBookModified || 0}_${
        book.lastBookOpen || lastBookOpen || 0
      }.zip`;
    }

    return `bookdata_${exporterVersion}_${currentDbVersion}_${BaseStorageHandler.getBookCharacters(
      book.characters || 0,
      book.sections || []
    )}_${book.lastBookModified || 0}_${book.lastBookOpen || 0}.zip`;
  }

  static getProgressFileName(progress: BooksDbBookmarkData | File) {
    if (progress instanceof File) {
      return progress.name;
    }

    const completedSuffix = progress.completed ? '_completed' : '';

    return `progress_${exporterVersion}_${currentDbVersion}_${progress.lastBookmarkModified || 0}_${
      progress.progress || 0
    }${completedSuffix}.json`;
  }

  static async getCoverFileName(cover: Blob) {
    const type = (await BaseStorageHandler.determineImageExtension(cover)) || 'jpeg';

    return `cover_${exporterVersion}_${currentDbVersion}.${type}`;
  }

  static getBookMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.zip$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      characters: +parts[3],
      lastBookModified: +parts[4],
      lastBookOpen: +parts[5]
    };
  }

  static getProgressMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastBookmarkModified: +parts[3],
      progress: +parts[4],
      completed: parts[5] === 'completed'
    };
  }

  static getReadingGoalsMetadata(filename: string) {
    const parts = filename.split('_').map((part) => part.replace(/\.json$/, ''));

    return {
      exporterVersion: +parts[1],
      dbVersion: +parts[2],
      lastGoalModified: +parts[3]
    };
  }

  private static async determineImageExtension(cover: Blob) {
    if (cover.type) {
      return cover.type.replace('image/', '') || 'jpeg';
    }

    let buffer: Uint8Array;

    try {
      if (typeof cover.arrayBuffer === 'function') {
        buffer = new Uint8Array(await cover.arrayBuffer());
      } else {
        buffer = await this.readBufferForBlob(cover);
      }

      const magicBytes = buffer.slice(0, 4);

      let hexSignature = '';

      for (let index = 0, { length } = magicBytes; index < length; index += 1) {
        hexSignature += magicBytes[index].toString(16);
      }

      switch (true) {
        case /^89504e47/.test(hexSignature):
          return 'png';
        case /^47494638/.test(hexSignature):
          return 'gif';
        case /^424d/.test(hexSignature):
          return 'bmp';
        case /^52494646/.test(hexSignature):
          return 'webp';
        default:
          return 'jpeg';
      }
    } catch (_error) {
      return 'jpeg';
    }
  }

  private static readBufferForBlob(blob: Blob): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.addEventListener('load', () => {
        resolve(new Uint8Array(reader.result as ArrayBuffer));
      });

      reader.addEventListener('error', () => {
        reject(new Error(`Error reading Blob`));
      });

      reader.readAsArrayBuffer(blob);
    });
  }
}

/**
 * Per-scope chassis. Each call to a handler's `scoped(ctx, settings,
 * cancelSignal)` returns one of these — short-lived, immutable after
 * construction, no aliasing with concurrent scopes. The handler owns
 * the caches; the scoped instance owns the "which book / how to save
 * / when to bail" half of the operation.
 *
 * Subclasses provide the per-endpoint implementation of
 * `ScopedBookOperations` and reach into `this.handler` for shared
 * infrastructure (network clients, file caches).
 */
export abstract class BaseScopedHandler<H> {
  protected readonly handler: H;

  protected readonly context: ReplicationContext;

  protected readonly settings: ScopedSettings;

  protected readonly cancelSignal: AbortSignal | undefined;

  protected readonly sanitizedTitle: string;

  constructor(
    handler: H,
    context: ReplicationContext,
    settings: ScopedSettings,
    cancelSignal?: AbortSignal
  ) {
    this.handler = handler;
    this.context = context;
    this.settings = settings;
    this.cancelSignal = cancelSignal;
    this.sanitizedTitle = BaseStorageHandler.sanitizeForFilename(context.title);
  }

  protected get title() {
    return this.context.title;
  }

  protected get saveBehavior() {
    return this.settings.saveBehavior;
  }

  protected get isNewOnly() {
    return this.settings.saveBehavior === ReplicationSaveBehavior.NewOnly;
  }

  protected get isOverwrite() {
    return this.settings.saveBehavior === ReplicationSaveBehavior.Overwrite;
  }
}
