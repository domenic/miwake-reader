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
  import { getLibrary } from '$lib/data/storage/storage-handler-factory';
  import { SyncEndpointType } from '$lib/data/storage/storage-types';
  import {
    booklistSortOptions$,
    cacheStorageData$,
    confirmStatisticsDeletion$,
    database,
    fileCountData$,
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
  import {
    replicationProgress$,
    type ReplicationProgress
  } from '$lib/functions/replication/replication-progress';
  import { pluralize } from '$lib/functions/utils';
  import pLimit from 'p-limit';
  import { combineLatest, map, Observable, share, Subject, takeUntil } from 'rxjs';
  import { onDestroy, onMount, tick } from 'svelte';
  import Fa from 'svelte-fa';

  const booksAreLoading$ = database.listLoading$.pipe(map((isLoading) => isLoading));

  // The unified library view always reads from the local IndexedDB
  // (browser storage). Placeholder books (not-yet-downloaded cloud
  // content) stay in the list with a cloud-icon marker and are
  // downloaded transparently when clicked; see onBookClick below.
  const bookCards$: Observable<BookCardProps[]> = combineLatest([
    database.dataList$,
    database.bookmarks$,
    booklistSortOptions$
  ]).pipe(
    map(([dataList, bookmarks, sortProp]) => {
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
  let cancelToken = $state(new AbortController());
  let cancelSignal = $derived(cancelToken.signal);
  let cancelTooltip = $state('');
  let replicationProgress = $state(0);
  let replicationToProgress = $state(0);
  let replicationProgressRemaining = $state('~ ??:??:??');
  let replicationDone = new Subject<void>();
  let progressBase = 0;
  let executionStart = 0;

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
   * Verify that some sync source is still connected before navigating
   * to the reader on a placeholder; the reader owns the actual
   * download. With at-most-one cloud + one fs there's no per-book
   * routing — any connected source can satisfy.
   */
  async function ensurePlaceholderIsReachable(): Promise<void> {
    const db = await database.db;
    const sources = await db.getAll('storageSource');
    if (sources.length === 0) {
      throw new Error(
        "This book's content isn't downloaded and no sync source is connected. Connect one from Settings → Sync to download."
      );
    }
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
        await ensurePlaceholderIsReachable();
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
    return !replicationToProgress;
  }

  function initializeReplicationProgressData() {
    replicationDone = new Subject<void>();
    replicationProgress$.pipe(takeUntil(replicationDone)).subscribe(updateProgress);
    replicationProgressRemaining = '~ ??:??:??';
    replicationProgress = 0;
    replicationToProgress = 1;
    executionStart = Date.now();
    logger.clearHistory();
    cancelToken = new AbortController();
  }

  function resetProgress() {
    replicationDone.next();
    replicationDone.complete();
    replicationToProgress = 0;
    replicationProgress = 0;
    cancelTooltip = '';
  }

  function updateProgress(p: ReplicationProgress) {
    if (cancelSignal.aborted) return;

    progressBase = p.progressBase || progressBase || 0;
    replicationToProgress = p.maxProgress || replicationToProgress || 0;

    if (p.skipStep) {
      const diff =
        Math.ceil(replicationProgress / progressBase) * progressBase - replicationProgress;
      replicationProgress =
        Math.floor((replicationProgress + (diff || progressBase) + Number.EPSILON) * 1000) / 1000;
    } else if (p.completeStep) {
      const diff = Math.ceil(replicationProgress) - replicationProgress;
      replicationProgress = Math.floor((replicationProgress + diff + Number.EPSILON) * 1000) / 1000;
    } else if (p.progressToAdd && p.progressToAdd > 0) {
      replicationProgress =
        Math.floor((replicationProgress + p.progressToAdd + Number.EPSILON) * 1000) / 1000;
    }

    if (p.progressToAdd) {
      const duration = (Date.now() - executionStart) / 1000;
      const processPerSecond = replicationProgress / duration;
      const remaining = (replicationToProgress - replicationProgress) / processPerSecond;
      replicationProgressRemaining =
        replicationToProgress > replicationProgress
          ? `~ ${getTimestamp(Math.ceil(remaining))}`
          : '~ 00:00:01';
    }
  }

  function getTimestamp(seconds: number) {
    return seconds && Number.isFinite(seconds)
      ? new Date(seconds * 1000).toISOString().substr(11, 8)
      : '??:??:??';
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

    cancelTooltip = 'Cancels the current import\nAlready imported data will not be deleted';
    initializeReplicationProgressData();

    const error = await importData(
      document,
      getLibrary({
        cacheStorageData: $cacheStorageData$,
        saveBehavior: $replicationSaveBehavior$,
        statisticsMergeMode: $statisticsMergeMode$,
        readingGoalsMergeMode: $readingGoalsMergeMode$
      }),
      files,
      cancelSignal,
      $fileCountData$
    ).catch((catchedError) => catchedError.message);

    resetProgress();

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

    cancelTooltip = 'Cancels the deletion\nAlready deleted data will not be restored';
    initializeReplicationProgressData();

    const currentBookCount = $bookCards$.length;
    const handler = getLibrary();
    const { error, deleted } = await handler.deleteBookData(
      $bookCards$.reduce((toDelete, card) => {
        if (bookIds.includes(card.id)) toDelete.push(card.title);
        return toDelete;
      }, [] as string[]),
      cancelSignal,
      $keepLocalStatisticsOnDeletion$
    );

    resetProgress();

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

    cancelTooltip = 'Cancels the current process';
    initializeReplicationProgressData();

    const limiter = pLimit(1);
    const tasks: Promise<void>[] = [];

    let failed = 0;

    replicationProgress$.next({ progressBase: 1, maxProgress: titles.length });

    titles.forEach((title) => {
      tasks.push(
        limiter(async () => {
          try {
            throwIfAborted(cancelSignal);
            await database.deleteStatisticEntries([title], true);
            replicationProgress$.next({ progressToAdd: 1 });
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

    resetProgress();

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
    {replicationProgress}
    {replicationToProgress}
    {replicationProgressRemaining}
    {cancelTooltip}
    bind:selectMode
    onselectAllClick={onSelectAllBooks}
    onremoveClick={() => removeBooks(Array.from(selectedBookIds))}
    onfilesChange={onFilesChange}
    onbugReportClick={showBugReportDialog}
    ondeleteStatistics={onDeleteStatistics}
    oncancelReplication={() => {
      if (!cancelSignal.aborted) {
        cancelToken.abort();
        replicationProgressRemaining = 'Canceling…';
      }
    }}
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
