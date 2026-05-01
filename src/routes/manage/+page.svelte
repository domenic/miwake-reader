<script lang="ts">
  import { goto } from '$app/navigation';
  import { faUpload } from '@fortawesome/free-solid-svg-icons';
  import BookCardList from '$lib/components/book-card/book-card-list.svelte';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import BookManagerHeader from '$lib/components/book-card/book-manager-header.svelte';
  import {
    showBugReportDialog,
    showErrorDialogWithLogReport
  } from '$lib/components/log-report-dialog-content.svelte';
  import { preFilteredTitlesForStatistics$ } from '$lib/components/statistics/statistics-types';
  import { pxScreen } from '$lib/css-classes';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { appName, pagePath } from '$lib/data/env';
  import { logger } from '$lib/data/logger';
  import { confirmDialog, messageDialog } from '$lib/data/simple-dialogs';
  import { SortDirection, type SortOption } from '$lib/data/sort-types';
  import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
  import { StorageKey } from '$lib/data/storage/storage-types';
  import { storageSource$ } from '$lib/data/storage/storage-view';
  import {
    booklistSortOptions$,
    cacheStorageData$,
    confirmStatisticsDeletion$,
    database,
    fileCountData$,
    isOnline$,
    keepLocalStatisticsOnDeletion$,
    readingGoalsMergeMode$,
    replicationSaveBehavior$,
    statisticsMergeMode$
  } from '$lib/data/store';
  import { cloneMutateSet } from '$lib/functions/clone-mutate-set';
  import { getDropEventFiles } from '$lib/functions/file-dom/get-drop-event-files';
  import { inputFile } from '$lib/functions/file-dom/input-file';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { keyBy } from '$lib/functions/key-by';
  import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
  import { importData } from '$lib/functions/replication/replicator';
  import { throwIfAborted } from '$lib/functions/replication/replication-error';
  import { pluralize } from '$lib/functions/utils';
  import pLimit from 'p-limit';
  import { combineLatest, map, Observable, share } from 'rxjs';
  import { onDestroy, onMount, tick } from 'svelte';
  import Fa from 'svelte-fa';

  // Pin the unified library view to browser storage. Any previously-
  // persisted storageSource$ value (e.g. gdrive, onedrive, fs from the
  // old per-source dropdown) gets reset here.
  onMount(() => {
    if ($storageSource$ !== StorageKey.BROWSER) {
      storageSource$.next(StorageKey.BROWSER);
    }
  });

  const booksAreLoading$ = database.listLoading$.pipe(map((isLoading) => isLoading));

  // The unified library view always reads from the local IndexedDB
  // (browser storage). storageSource$ is pinned to BROWSER on mount —
  // no more per-source dropdown. Placeholder books (not-yet-downloaded
  // cloud content) stay in the list with a cloud-icon marker and are
  // downloaded transparently when clicked; see onBookClick below.
  const bookCards$: Observable<BookCardProps[]> = combineLatest([
    database.dataList$,
    database.bookmarks$,
    booklistSortOptions$
  ]).pipe(
    map(([dataList, bookmarks]) => {
      const sortProp = $booklistSortOptions$[StorageKey.BROWSER];
      const isTitleSort = sortProp.property === 'title';
      const bookmarkMap = keyBy(bookmarks, 'dataId');

      return [
        ...dataList
          .map((d) => ({
            ...d,
            ...bookmarkToProgress(bookmarkMap.get(d.id))
          }))
          .sort((card1: BookCardProps, card2: BookCardProps) =>
            sortBookCards(card1, card2, sortProp, isTitleSort)
          )
      ];
    }),
    share()
  );

  const currentBookId$ = database.lastItem$.pipe(
    map((item) => item?.dataId),
    share()
  );

  let selectedBookIds: ReadonlySet<number> = $state(new Set());
  let selectMode = $state(false);
  // Cancellation token for the import / delete code paths. The
  // visible cancel button that used to drive .abort() lived in the
  // header's progress UI which has since been removed; the token
  // stays because importData / deleteBookData require an
  // AbortSignal in their signatures.
  let cancelToken = new AbortController();
  let cancelSignal = $derived(cancelToken.signal);

  $effect(() => {
    if (!selectMode) {
      selectedBookIds = new Set();
    }
  });

  onDestroy(() => dialogManager.dialogs$.next([]));

  function bookmarkToProgress(b: BooksDbBookmarkData | undefined) {
    return b?.progress
      ? {
          progress: typeof b.progress === 'string' ? +b.progress.slice(0, -1) : b.progress,
          completed: !!b.completed,
          lastBookmarkModified: b.lastBookmarkModified || 0
        }
      : { progress: 0, completed: false, lastBookmarkModified: 0 };
  }

  function sortBookCards(
    card1: BookCardProps,
    card2: BookCardProps,
    sortProp: SortOption,
    isTitleSort: boolean
  ) {
    const card1Prop = card1[sortProp.property] || (isTitleSort ? '' : 0);
    const card2Prop = card2[sortProp.property] || (isTitleSort ? '' : 0);

    let sortDiff = 0;

    if (sortProp.direction === SortDirection.ASC) {
      sortDiff = isTitleSort
        ? card1.title.localeCompare(card2.title, 'ja-JP', { numeric: true })
        : +card1Prop - +card2Prop;
    } else {
      sortDiff = isTitleSort
        ? card2.title.localeCompare(card1.title, 'ja-JP', { numeric: true })
        : +card2Prop - +card1Prop;
    }

    if (!sortDiff) {
      sortDiff = card1.title.localeCompare(card2.title, 'ja-JP', { numeric: true });
    }

    return sortDiff;
  }

  /**
   * Pick the storage handler that should satisfy a book-open request.
   * Fully-downloaded books open from the local browser IndexedDB
   * directly. Placeholders (no local elementHtml) route through the
   * source the book was originally imported from, so that handler's
   * prepareBookForReading can fetch the content and cache it locally.
   */
  async function resolveHandlerSource(
    bookItem: BookCardProps & { storageSource?: string }
  ): Promise<{ type: StorageKey; name: string }> {
    if (!bookItem.isPlaceholder) {
      return { type: StorageKey.BROWSER, name: '' };
    }

    const origin = bookItem.storageSource;
    if (!origin) {
      throw new Error(
        "This book's content isn't downloaded and its original sync source is unknown. Re-import it to open."
      );
    }

    const db = await database.db;
    const record = await db.get('storageSource', origin);
    if (!record) {
      throw new Error(
        `This book's content isn't downloaded and its original source (${origin}) is no longer connected. Reconnect it from Settings → Sync to download.`
      );
    }

    return { type: record.type, name: record.name };
  }

  async function onBookClick(bookId: number) {
    if (!operationAllowed()) {
      return;
    }

    if (selectMode) {
      selectedBookIds = cloneMutateSet(selectedBookIds, (set) => {
        if (set.has(bookId)) {
          set.delete(bookId);
          return;
        }
        set.add(bookId);
      });
      return;
    }

    // /manage is a launcher — the reader owns downloading. For a
    // placeholder, pre-check that the original sync source is still
    // connected so we can surface a friendlier error than "couldn't
    // render empty book" if not; otherwise just navigate.
    const bookItem = $bookCards$.find((book) => book.id === bookId);
    if (!bookItem) return;

    if (bookItem.isPlaceholder) {
      try {
        await resolveHandlerSource(bookItem);
      } catch (error: any) {
        const message = `Can't open book: ${error.message}`;
        logger.warn(message);
        messageDialog({ title: 'Error', message });
        return;
      }
    }

    openBook(bookId);
  }

  function operationAllowed() {
    const connectivityPass = !(
      ($storageSource$ === StorageKey.GDRIVE || $storageSource$ === StorageKey.ONEDRIVE) &&
      !$isOnline$
    );

    if (!connectivityPass) {
      const message = 'You have to be online for this operation';
      logger.warn(message);
      messageDialog({ title: 'Failure', message });
    }

    return connectivityPass;
  }

  function openBook(bookId: number) {
    if (!bookId) {
      return;
    }

    database.putLastItem(bookId);
    gotoBook(bookId);
  }

  async function gotoBook(id: number) {
    await goto(`${pagePath}/b?id=${id}`);
  }

  async function onFilesChange(fileList: FileList | File[]) {
    if (!operationAllowed()) return;

    const supportedExtRegex = /\.(?:htmlz|epub|txt)$/;
    const files = Array.from(fileList).filter((f) => supportedExtRegex.test(f.name));
    const errorTitle = 'Book Import Failed';

    if (!files.length) {
      showError(errorTitle, 'Imported files must be in EPUB, TXT, or HTMLZ format.');
      return;
    }

    cancelToken = new AbortController();
    logger.clearHistory();

    const error = await importData(
      document,
      getStorageHandler(
        window,
        $storageSource$,
        '',
        $storageSource$ === StorageKey.BROWSER,
        $cacheStorageData$,
        $replicationSaveBehavior$,
        $statisticsMergeMode$,
        $readingGoalsMergeMode$
      ),
      files,
      cancelSignal,
      $fileCountData$
    ).catch((catchedError) => catchedError.message);

    if (error) {
      showError(errorTitle, error, 'An error occurred during book import.');
    }
  }

  function showError(title: string, message: string, fallbackMessage: string = message) {
    const showReport = logger.errorCount > 1;

    logger.warn(message);

    if (showReport) {
      showErrorDialogWithLogReport({ title, message: fallbackMessage });
    } else {
      messageDialog({ title, message });
    }
  }

  function onSelectAllBooks() {
    const bookCards = $bookCards$;
    selectedBookIds = cloneMutateSet(selectedBookIds, (set) => {
      bookCards.forEach((x) => set.add(x.id));
    });
  }

  async function removeBooks(bookIds: number[]) {
    if (!operationAllowed()) return;

    cancelToken = new AbortController();
    logger.clearHistory();

    const currentBookCount = $bookCards$.length;
    const handler = getStorageHandler(window, $storageSource$, '');
    const { error, deleted } = await handler.deleteBookData(
      $bookCards$.reduce((toDelete, card) => {
        if (bookIds.includes(card.id)) toDelete.push(card.title);
        return toDelete;
      }, [] as string[]),
      cancelSignal,
      $keepLocalStatisticsOnDeletion$
    );

    await tick();

    if (deleted.length === currentBookCount) {
      selectMode = false;
    } else {
      selectedBookIds = cloneMutateSet(selectedBookIds, (set) => {
        deleted.forEach((deletedBookId) => set.delete(deletedBookId));
      });
    }

    if (error) {
      showError('Deletion Failed', error, 'An error occurred during book deletion.');
    }
  }

  async function onDeleteStatistics() {
    const titles = $bookCards$
      .filter((card) => selectedBookIds.has(card.id))
      .map((book) => book.title);

    let wasCanceled = false;

    if ($confirmStatisticsDeletion$) {
      wasCanceled = await confirmDialog({
        title: 'Delete Data',
        message: `This will delete all statistics for the selected ${pluralize(
          titles.length,
          'book',
          false
        )} (which may include start and/or completion data).\n\nExecute a one-time sync with an export behavior of "replace" and/or a statistics merge mode of "replace" to apply deletions to other devices.`
      });
    }

    if (wasCanceled) return;

    cancelToken = new AbortController();
    logger.clearHistory();

    const limiter = pLimit(1);
    const tasks: Promise<void>[] = [];

    let failed = 0;

    titles.forEach((title) => {
      tasks.push(
        limiter(async () => {
          try {
            throwIfAborted(cancelSignal);
            await database.deleteStatisticEntries([title], true);
          } catch (error) {
            handleErrorDuringReplication(error, `Error on deleting statistics for ${title}: `, [
              limiter
            ]);
            failed += 1;
          }
        })
      );
    });

    await Promise.all(tasks).catch(() => {});

    if (failed) {
      showError('Deletion Failed', `Unable to delete statistics for ${pluralize(failed, 'book')}.`);
    }
  }
</script>

<svelte:head>
  <title>{formatPageTitle('Book Manager')}</title>
</svelte:head>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <BookManagerHeader
    selectedCount={selectedBookIds.size}
    hasBooks={!!$bookCards$?.length}
    bind:selectMode
    onselectAllClick={onSelectAllBooks}
    onremoveClick={() => removeBooks(Array.from(selectedBookIds))}
    onfilesChange={onFilesChange}
    onbugReportClick={showBugReportDialog}
    ondeleteStatistics={onDeleteStatistics}
  />
</div>

<div
  role="application"
  class="{pxScreen} h-full pt-16"
  ondragenter={(ev) => ev.preventDefault()}
  ondragover={(ev) => ev.preventDefault()}
  ondragend={(ev) => ev.preventDefault()}
  ondrop={(ev) => {
    ev.preventDefault();
    getDropEventFiles(ev).then(onFilesChange);
  }}
>
  {#if !$bookCards$ || $booksAreLoading$}
    Loading...
  {:else if $bookCards$.length}
    <BookCardList
      currentBookId={$currentBookId$}
      {selectedBookIds}
      bookCards={$bookCards$}
      onbookClick={({ id }) => onBookClick(id)}
      onremoveBookClick={({ id }) => removeBooks([id])}
    />
  {:else}
    <div class="flex h-full flex-col items-center gap-6 pt-8 text-center">
      <h1 class="text-2xl font-bold">{appName}</h1>
      <p class="max-w-3xl px-8 text-gray-500">
        An online ebook reader for Japanese language learners. Read EPUB and TXT files in your
        browser with support for dictionary extensions like Yomitan.
      </p>
      <label
        class="mt-8 flex cursor-pointer flex-col items-center gap-4 text-gray-400/40 transition-colors hover:text-gray-400/60"
      >
        <div class="flex w-32 justify-center">
          <Fa icon={faUpload} style="width: 100%; height: auto" />
        </div>
        <span class="text-sm text-gray-500">Drop files here or click to upload</span>
        <input
          type="file"
          accept="application/epub+zip,.epub,.htmlz,plain/text,.txt"
          multiple
          hidden
          use:inputFile={onFilesChange}
        />
      </label>
      <div class="mt-auto pb-4 text-xs text-gray-400">
        <a href="{pagePath}/privacy" class="underline">Privacy Policy</a>
      </div>
    </div>
  {/if}
</div>
