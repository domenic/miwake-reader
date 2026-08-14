<script lang="ts">
  import { resolve } from '$app/paths';
  import { faUpload } from '@fortawesome/free-solid-svg-icons';
  import BookCardList from '$lib/components/book-card/book-card-list.svelte';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import BookManagerHeader from '$lib/components/book-card/book-manager-header.svelte';
  import {
    defaultStatisticsView,
    getStatisticsURL
  } from '$lib/components/statistics/statistics-view';
  import { showBugReportDialog, showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import { pxScreen } from '$lib/css-classes';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { appName } from '$lib/data/env';
  import {
    userDeleteBooks,
    userDeleteStatisticEntries,
    userImportBooks,
    userSaveBookmark
  } from '$lib/data/library';
  import { logger } from '$lib/data/logger';
  import { reconcileForBookOpen } from '$lib/data/sync/sync-engine';
  import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
  import { showMessageDialog } from '$lib/components/message-dialog.svelte';
  import { bookOrder, byTitle, displayTitle } from '$lib/functions/book-title';
  import { byNumber, type Comparator, type SortOption } from '$lib/functions/sorting';
  import {
    booklistSortOptions$,
    confirmStatisticsDeletion$,
    database,
    keepLocalReadingDataOnDeletion$
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
  // content) stay in the list with a Download action and are
  // downloaded transparently when opened in the reader.
  let bookCards = $derived(
    getBookCards(database.dataList, database.bookmarks, $booklistSortOptions$)
  );

  let selectedBookTitles: ReadonlySet<string> = $state(new Set());
  let selectMode = $state(false);
  let selectedBookCards = $derived(bookCards.filter((book) => selectedBookTitles.has(book.title)));
  let selectedCompletedCount = $derived(selectedBookCards.filter((book) => book.completed).length);
  let selectedPlaceholderCount = $derived(
    selectedBookCards.filter((book) => book.isPlaceholder).length
  );
  let selectedStatisticsHref = $derived.by(() => {
    const bookTitles = selectedBookCards.map((book) => book.title);
    return bookTitles.length
      ? resolve(getStatisticsURL(defaultStatisticsView, bookTitles))
      : undefined;
  });
  let abortController = $state(new AbortController());
  let signal = $derived(abortController.signal);
  let cancelTooltip = $state('');
  let fileCountData = $state<Record<string, number>>();

  $effect(() => {
    if (!selectMode) {
      selectedBookTitles = new Set();
    }
  });

  // One comparator per sort-menu entry; adding a menu entry without
  // deciding its comparator is a type error.
  const cardComparators: Record<SortOption['property'], Comparator<BookCardProps>> = {
    title: byTitle,
    addedOrder: byNumber((card) => card.addedOrder ?? 0),
    characters: byNumber((card) => card.characters),
    lastBookModified: byNumber((card) => card.lastBookModified),
    lastBookOpen: byNumber((card) => card.lastBookOpen),
    progress: byNumber((card) => card.progress),
    lastBookmarkModified: byNumber((card) => card.lastBookmarkModified)
  };

  function getBookCards(
    dataList: BookCardProps[],
    bookmarks: BooksDbBookmarkData[],
    sortProp: SortOption
  ) {
    const bookmarkMap = keyBy(bookmarks, 'title');

    return dataList
      .map((d) => ({
        ...d,
        ...bookmarkToProgress(bookmarkMap.get(d.title))
      }))
      .sort(bookOrder(cardComparators[sortProp.property] ?? byTitle, sortProp.direction));
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

  function selectBook(title: string) {
    selectedBookTitles = cloneMutateSet(selectedBookTitles, (set) => {
      if (set.has(title)) {
        set.delete(title);
        return;
      }
      set.add(title);
    });
  }

  async function downloadBook(title: string) {
    if (!operationAllowed()) return;

    const bookItem = bookCards.find((book) => book.title === title);
    if (!bookItem || !bookItem.isPlaceholder) return;

    if (!(await placeholderDownloadAvailable())) return;

    await reconcileForBookOpen({
      title: bookItem.title,
      imagePath: bookItem.imagePath
    });
    void database.notifyDataListChanged();
  }

  async function placeholderDownloadAvailable() {
    const db = await database.db;
    if ((await db.count('storageSource')) > 0) return true;

    showMessageDialog({
      title: "Can't download book",
      message:
        "This book's content isn't downloaded and no sync source is connected. Connect one from Settings → Sync to download."
    });
    return false;
  }

  async function setBookCompleted(title: string, completed: boolean) {
    if (!operationAllowed()) return;

    const bookItem = bookCards.find((book) => book.title === title);
    if (!bookItem) return;

    try {
      const existingBookmark = await database.getBookmark(title);
      // Session and completion statistics are recorded in the reader. The library action only
      // changes the durable completion marker while preserving the reader's current position.
      await userSaveBookmark(
        {
          ...existingBookmark,
          title,
          progress: existingBookmark?.progress ?? 0,
          completed,
          lastBookmarkModified: Date.now()
        },
        { title: bookItem.title, imagePath: bookItem.imagePath }
      );
    } catch (error) {
      showErrorDialog({
        title: completed ? 'Error completing book' : 'Error marking book as in progress',
        error
      });
    }
  }

  async function setSelectedBooksCompleted(completed: boolean) {
    for (const book of selectedBookCards) {
      await setBookCompleted(book.title, completed);
    }
  }

  async function downloadSelectedBooks() {
    for (const book of selectedBookCards.filter((candidate) => candidate.isPlaceholder)) {
      await downloadBook(book.title);
    }
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
      await userImportBooks(document, files, signal, fileCountData);
    } catch (error) {
      showErrorDialog({ title: errorTitle, error });
    } finally {
      resetProgress();
    }
  }

  function onToggleAllBooks() {
    if (selectedBookTitles.size === bookCards.length) {
      selectedBookTitles = new Set();
      return;
    }

    selectedBookTitles = cloneMutateSet(selectedBookTitles, (set) => {
      bookCards.forEach((x) => set.add(x.title));
    });
  }

  async function removeBooks(titlesToDelete: string[]) {
    if (!operationAllowed()) return;

    if (!titlesToDelete.length) return;

    const confirmed = await showConfirmDialog({
      title:
        titlesToDelete.length === 1
          ? 'Remove book from library?'
          : `Remove ${titlesToDelete.length} books from library?`,
      message: `This will remove ${
        titlesToDelete.length === 1
          ? `『${displayTitle(titlesToDelete[0])}』`
          : 'the selected books'
      } from your library. The deletion will sync to your other devices. Depending on your settings, reading statistics may also be deleted.`,
      confirmLabel: 'Remove',
      danger: true
    });

    if (!confirmed) return;

    cancelTooltip = 'Cancels the deletion\nAlready deleted data will not be restored';
    initializeReplicationProgressData();

    try {
      await userDeleteBooks(titlesToDelete, signal, $keepLocalReadingDataOnDeletion$);
    } catch (error) {
      showErrorDialog({ title: 'Error deleting books', error });
    } finally {
      resetProgress();
      // The refresh triggered by the delete itself is fire-and-forget;
      // await one explicitly so the reconciliation below observes the
      // post-delete book set instead of a stale snapshot.
      await database.notifyDataListChanged();
      await tick();
      // Reconcile selection state with whatever is actually in IDB
      // now: titles that no longer exist on the cards list (i.e. were
      // successfully deleted) drop out of the selection set; titles that
      // still exist (failed deletes) stay selected so the user can
      // retry. Works for both full success and partial failure.
      const stillPresent = new Set(bookCards.map((card) => card.title));
      selectedBookTitles = cloneMutateSet(selectedBookTitles, (set) => {
        set.forEach((title) => {
          if (!stillPresent.has(title)) set.delete(title);
        });
      });
      if (selectedBookTitles.size === 0) selectMode = false;
    }
  }

  async function onDeleteStatistics(titles = Array.from(selectedBookTitles)) {
    if (!operationAllowed()) return;

    if (!titles.length) return;

    let confirmed = true;

    if ($confirmStatisticsDeletion$) {
      confirmed = await showConfirmDialog({
        title: 'Delete data',
        message: `This will delete all statistics for ${
          titles.length === 1
            ? `『${displayTitle(titles[0])}』`
            : `the selected ${pluralize(titles.length, 'book')}`
        } (which may include start and/or completion data). The deletion will sync to your other devices.`,
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
    bookCount={bookCards.length}
    selectedCount={selectedBookTitles.size}
    {selectedCompletedCount}
    {selectedPlaceholderCount}
    replicationProgress={replicationProgressState.progress}
    replicationToProgress={replicationProgressState.toProgress}
    replicationProgressRemaining={replicationProgressState.remaining}
    {cancelTooltip}
    bind:fileCountData
    bind:selectMode
    statisticsHref={selectedStatisticsHref}
    onselectAllClick={onToggleAllBooks}
    oncompletionChange={setSelectedBooksCompleted}
    ondownloadClick={downloadSelectedBooks}
    onremoveClick={() => removeBooks(Array.from(selectedBookTitles))}
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

<!-- The drag handlers live outside the inert subtree: while replication runs, drag events fall
  through inert content to this wrapper, which must still cancel them or the browser would
  navigate to the dropped file. -->
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
  <div class="h-full" inert={!!replicationProgressState.toProgress}>
    {#if database.listLoading}
      Loading...
    {:else if bookCards.length}
      <BookCardList
        currentBookTitle={database.lastItemTitle}
        {selectMode}
        {selectedBookTitles}
        {bookCards}
        onbookSelect={({ title }) => selectBook(title)}
        ondownloadBookClick={({ title }) => downloadBook(title)}
        oncompleteBookClick={({ title, completed }) => setBookCompleted(title, completed)}
        ondeleteStatisticsClick={({ title }) => onDeleteStatistics([title])}
        onremoveBookClick={({ title }) => removeBooks([title])}
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
</div>
