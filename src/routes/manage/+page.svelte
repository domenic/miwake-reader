<script lang="ts">
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { faUpload } from '@fortawesome/free-solid-svg-icons';
  import BookCardList from '$lib/components/book-card/book-card-list.svelte';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import BookManagerHeader from '$lib/components/book-card/book-manager-header.svelte';
  import { showBugReportDialog, showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import { pxScreen } from '$lib/css-classes';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { appName } from '$lib/data/env';
  import { userDeleteBooks, userDeleteStatisticEntries, userImportBooks } from '$lib/data/library';
  import { logger } from '$lib/data/logger';
  import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
  import { showMessageDialog } from '$lib/components/message-dialog.svelte';
  import { SortDirection, type SortOption } from '$lib/data/sort-types';
  import {
    booklistSortOptions$,
    confirmStatisticsDeletion$,
    database,
    fileCountData$,
    keepLocalStatisticsOnDeletion$
  } from '$lib/data/store';
  import { cloneMutateSet } from '$lib/functions/clone-mutate-set';
  import { getDropEventFiles } from '$lib/functions/file-dom/get-drop-event-files';
  import { inputFile } from '$lib/functions/file-dom/input-file';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { keyBy } from '$lib/functions/key-by';
  import { handleErrorDuringReplication } from '$lib/functions/replication/error-handler';
  import { replicationProgressState } from '$lib/functions/replication/replication-progress.svelte';
  import { pluralize } from '$lib/functions/utils';
  import pLimit from 'p-limit';
  import { tick } from 'svelte';
  import Fa from 'svelte-fa';

  // The unified library view always reads from the local IndexedDB
  // (browser storage). Placeholder books (not-yet-downloaded cloud
  // content) stay in the list with a cloud-icon marker and are
  // downloaded transparently when clicked; see onBookClick below.
  let bookCards = $derived(
    getBookCards(database.dataList, database.bookmarks, $booklistSortOptions$)
  );

  let selectedBookIds: ReadonlySet<number> = $state(new Set());
  let selectMode = $state(false);
  let abortController = $state(new AbortController());
  let signal = $derived(abortController.signal);
  let cancelTooltip = $state('');

  $effect(() => {
    if (!selectMode) {
      selectedBookIds = new Set();
    }
  });

  function getBookCards(
    dataList: BookCardProps[],
    bookmarks: BooksDbBookmarkData[],
    sortProp: SortOption
  ) {
    const isTitleSort = sortProp.property === 'title';
    const bookmarkMap = keyBy(bookmarks, 'dataId');

    return dataList
      .map((d) => ({
        ...d,
        ...bookmarkToProgress(bookmarkMap.get(d.id))
      }))
      .sort((card1: BookCardProps, card2: BookCardProps) =>
        sortBookCards(card1, card2, sortProp, isTitleSort)
      );
  }

  function bookmarkToProgress(b: BooksDbBookmarkData | undefined) {
    return b
      ? {
          progress: typeof b.progress === 'string' ? +b.progress.slice(0, -1) : (b.progress ?? 0),
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

    let sortDiff: number;

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
    const bookItem = bookCards.find((book) => book.id === bookId);
    if (!bookItem) return;

    if (bookItem.isPlaceholder) {
      const db = await database.db;
      const sources = await db.getAll('storageSource');

      if (sources.length === 0) {
        showMessageDialog({
          title: "Can't open book",
          message:
            "This book's content isn't downloaded and no sync source is connected. Connect one from Settings → Sync to download."
        });
        return;
      }
    }

    await openBook(bookId);
  }

  function operationAllowed() {
    return !replicationProgressState.toProgress;
  }

  function initializeReplicationProgressData() {
    logger.clearHistory();
    abortController = new AbortController();
    replicationProgressState.start(abortController.signal);
  }

  function resetProgress() {
    replicationProgressState.reset();
    cancelTooltip = '';
  }

  async function openBook(bookId: number) {
    if (!bookId) {
      return;
    }

    await database.putLastItem(bookId);
    await goto(resolve(`/b?id=${bookId}`));
  }

  async function onFilesChange(fileList: FileList | File[]) {
    if (!operationAllowed()) return;

    const supportedExtRegex = /\.(?:htmlz|epub|txt)$/;
    const files = Array.from(fileList).filter((f) => supportedExtRegex.test(f.name));
    const errorTitle = 'Error importing books';

    if (!files.length) {
      showMessageDialog({
        title: 'Unsupported import format',
        message: 'Imported files must be in EPUB, TXT, or HTMLZ format.'
      });
      return;
    }

    cancelTooltip = 'Cancels the current import\nAlready imported data will not be deleted';
    initializeReplicationProgressData();

    try {
      await userImportBooks(document, files, signal, $fileCountData$);
    } catch (error) {
      showErrorDialog({ title: errorTitle, error });
    } finally {
      resetProgress();
    }
  }

  function onSelectAllBooks() {
    selectedBookIds = cloneMutateSet(selectedBookIds, (set) => {
      bookCards.forEach((x) => set.add(x.id));
    });
  }

  async function removeBooks(bookIds: number[]) {
    if (!operationAllowed()) return;

    cancelTooltip = 'Cancels the deletion\nAlready deleted data will not be restored';
    initializeReplicationProgressData();

    const titlesToDelete = bookCards.reduce((toDelete, card) => {
      if (bookIds.includes(card.id)) toDelete.push(card.title);
      return toDelete;
    }, [] as string[]);

    try {
      await userDeleteBooks(titlesToDelete, signal, $keepLocalStatisticsOnDeletion$);
    } catch (error) {
      showErrorDialog({ title: 'Error deleting books', error });
    } finally {
      resetProgress();
      await tick();
      // Reconcile selection state with whatever is actually in IDB
      // now: ids that no longer exist on the cards list (i.e. were
      // successfully deleted) drop out of the selection set; ids that
      // still exist (failed deletes) stay selected so the user can
      // retry. Works for both full success and partial failure.
      const stillPresent = new Set(bookCards.map((card) => card.id));
      selectedBookIds = cloneMutateSet(selectedBookIds, (set) => {
        set.forEach((id) => {
          if (!stillPresent.has(id)) set.delete(id);
        });
      });
      if (selectedBookIds.size === 0) selectMode = false;
    }
  }

  async function onDeleteStatistics() {
    const titles = bookCards
      .filter((card) => selectedBookIds.has(card.id))
      .map((book) => book.title);

    let confirmed = true;

    if ($confirmStatisticsDeletion$) {
      confirmed = await showConfirmDialog({
        title: 'Delete data',
        message: `This will delete all statistics for the selected ${pluralize(
          titles.length,
          'book',
          false
        )} (which may include start and/or completion data). The deletion will sync to your other devices.`,
        confirmLabel: 'Delete',
        danger: true
      });
    }

    if (!confirmed) return;

    cancelTooltip = 'Cancels the current process';
    initializeReplicationProgressData();

    const limiter = pLimit(1);
    const tasks: Promise<void>[] = [];

    const errors: unknown[] = [];

    replicationProgressState.report({ progressBase: 1, maxProgress: titles.length });

    titles.forEach((title) => {
      tasks.push(
        limiter(async () => {
          try {
            signal.throwIfAborted();
            await userDeleteStatisticEntries([title], true);
            replicationProgressState.report({ progressToAdd: 1 });
          } catch (error) {
            handleErrorDuringReplication(error, `Error on deleting statistics for ${title}: `, [
              limiter
            ]);
            errors.push(error);
          }
        })
      );
    });

    try {
      await Promise.all(tasks);
      if (errors.length) {
        throw errors[0];
      }
    } catch (error) {
      showErrorDialog({
        title: 'Error deleting statistics',
        error
      });
    } finally {
      resetProgress();
    }
  }
</script>

<svelte:head>
  <title>{formatPageTitle('Book Manager')}</title>
</svelte:head>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <BookManagerHeader
    selectedCount={selectedBookIds.size}
    hasBooks={bookCards.length > 0}
    replicationProgress={replicationProgressState.progress}
    replicationToProgress={replicationProgressState.toProgress}
    replicationProgressRemaining={replicationProgressState.remaining}
    {cancelTooltip}
    bind:selectMode
    onselectAllClick={onSelectAllBooks}
    onremoveClick={() => removeBooks(Array.from(selectedBookIds))}
    onfilesChange={onFilesChange}
    onbugReportClick={showBugReportDialog}
    ondeleteStatistics={onDeleteStatistics}
    oncancelReplication={() => {
      if (!signal.aborted) {
        abortController.abort();
        replicationProgressState.showCanceling();
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
  {#if database.listLoading}
    Loading...
  {:else if bookCards.length}
    <BookCardList
      currentBookId={database.lastItemId}
      {selectedBookIds}
      {bookCards}
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
        <a href={resolve('/privacy')} class="underline">Privacy Policy</a>
      </div>
    </div>
  {/if}
</div>
