<script lang="ts">
  import { browser } from '$app/environment';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import type { RouteId } from '$app/types';
  import { faSpinner } from '@fortawesome/free-solid-svg-icons';
  import { BookReaderController } from '$lib/components/book-reader/book-reader-controller.svelte';
  import BookReader from '$lib/components/book-reader/book-reader.svelte';
  import StyleSheetRenderer from '$lib/components/style-sheet-renderer.svelte';
  import {
    autoBookmark$,
    autoBookmarkTime$,
    autoPositionOnResize$,
    avoidPageBreak$,
    database,
    enableTapEdgeToFlip$,
    enableTextJustification$,
    enableTextWrapPretty$,
    firstDimensionMargin$,
    fontFamilyGroupOne$,
    fontFamilyGroupTwo$,
    fontSize$,
    furiganaStyle$,
    hideSpoilerImage$,
    multiplier$,
    pageColumns$,
    prioritizeReaderStyles$,
    secondDimensionMaxValue$,
    showFooterChapterCharacterCounter$,
    showFooterChapterPercentage$,
    textIndentation$,
    textMarginMode$,
    textMarginValue$,
    theme$,
    trackerAutostartTime$,
    verticalMode$,
    writingMode$,
    viewMode$,
    selectionToBookmarkEnabled$,
    lineHeight$,
    skipKeyDownListener$,
    confirmClose$,
    verticalCustomReadingPosition$,
    horizontalCustomReadingPosition$,
    customReadingPointEnabled$,
    statisticsEnabled$,
    openTrackerOnCompletion$,
    addCharactersOnCompletion$,
    manualBookmark$,
    customThemes$,
    overwriteBookCompletion$,
    startDayHoursForTracker$,
    pauseTrackerOnCustomPointChange$,
    hideSpoilerImageMode$,
    showCharacterCounter$,
    showPercentage$,
    enableVerticalFontKerning$,
    enableFontVPAL$,
    verticalTextOrientation$
  } from '$lib/data/store';
  import BookCompletionConfetti from '$lib/components/book-reader/book-completion-confetti/book-completion-confetti.svelte';
  import BookReaderHeader from '$lib/components/book-reader/book-reader-header.svelte';
  import { readerImageGallery } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery-state.svelte';
  import BookReaderImageGallery from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery.svelte';
  import { getDefaultStatistic } from '$lib/components/book-reader/book-reading-tracker/tracker-domain';
  import {
    openTrackerMenu,
    pauseTrackerFor,
    resumeTrackerFor,
    toggleTrackerPauseByUser,
    trackerStatus,
    type TrackerPauseReason
  } from '$lib/components/book-reader/book-reading-tracker/tracker-state.svelte';
  import BookReadingTracker from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker.svelte';
  import { bookTOCState } from '$lib/components/book-reader/book-toc/book-toc-state.svelte';
  import BookTOC from '$lib/components/book-reader/book-toc/book-toc.svelte';
  import { showNumberDialog } from '$lib/components/number-dialog.svelte';
  import { mergeEntries } from '$lib/components/merged-header-icon/merged-entries';
  import SidebarOverlay from '$lib/components/sidebar-overlay.svelte';
  import { getBookStatisticsURL } from '$lib/components/statistics/statistics-view';
  import {
    type BooksDbBookData,
    type BooksDbBookmarkData,
    type BooksDbStatistic
  } from '$lib/data/database/books-db/versions/books-db';
  import { PAGE_CHANGE } from '$lib/data/events';
  import { fullscreenManager } from '$lib/data/fullscreen-manager';
  import { logger } from '$lib/data/logger';
  import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
  import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import {
    markBookOpened,
    openBook,
    userSaveBookmark,
    userSaveStatistics
  } from '$lib/data/library';
  import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
  import { StorageDataType } from '$lib/data/storage/storage-types';
  import { availableThemes } from '$lib/data/theme-option';
  import { ViewMode } from '$lib/data/view-mode';
  import loadBookData, {
    type LoadedBookData
  } from '$lib/functions/book-data-loader/load-book-data';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
  import type { ReplicationContext } from '$lib/functions/replication/replication-progress.svelte';
  import {
    isSyncingOrPending,
    reconcileForBookOpen,
    syncAfterLocalMutation
  } from '$lib/data/sync/sync-engine';
  import { syncState } from '$lib/data/sync/sync-store.svelte';
  import { getDateKey } from '$lib/functions/statistic-util';
  import { clickOutside } from '$lib/functions/use-click-outside';
  import { convertRemToPixels, dummyFn, isMobile$, limitToRange } from '$lib/functions/utils';
  import { handleReaderKeydown } from '$lib/components/book-reader/book-reader-keybind';
  import { onDestroy, tick, untrack } from 'svelte';
  import Fa from 'svelte-fa';
  import {
    clearRange,
    getParagraphToPoint,
    getRangeForUserSelection,
    getReferencePoints,
    pulseElement
  } from '$lib/functions/range-util';

  type ReaderExitRoute = Extract<RouteId, '/manage' | '/settings' | '/statistics'>;

  const READER_STATISTICS_SYNC_THROTTLE_MS = 60_000;

  let showSpinner = $state(true);
  let showHeader = $state(false);
  let readerActionPending = $state(false);
  let isBookmarkScreen = $state(false);
  let showFooter = $state(true);
  let exploredCharCount = $state(0);
  let bookCharCount = $state(0);
  let bookmarkData: Promise<BooksDbBookmarkData | undefined> = $state(Promise.resolve(undefined));
  let customReadingPointTop = $state(-2);
  let customReadingPointLeft = $state(-2);
  let customReadingPoint = $state(
    $verticalMode$ ? $verticalCustomReadingPosition$ : $horizontalCustomReadingPosition$
  );
  let customReadingPointScrollOffset = $state(0);
  let customReadingPointRange = $state<Range>();
  let lastSelectedRange = $state<Range>();
  let lastSelectedRangeWasEmpty = $state(true);
  let isSelectingCustomReadingPoint = $state(false);
  let showCustomReadingPoint = $state(false);
  let storedExploredCharacter = 0;
  let hasBookmarkData = $state(false);
  let trackerElm: BookReadingTracker = $state()!;
  let resumeTrackerAfterTOCCloses = $state(false);
  let frozenPosition = $state(-1);
  let skipFirstFreezeChange = $state(false);
  let bookCompleted = $state(false);
  let isBookCompleted = $state(false);
  let confettiWidthModifier = $state(36);
  let confettiMaxRuns = $state(0);
  let showReaderImageGallery = $state(false);
  let wasTOCOpen = $state(false);
  let wasTrackerMenuOpen = $state(false);
  let lastReaderStatisticsSyncAt = 0;
  let readerStatisticsSyncDirty = false;

  const readerController = new BookReaderController();

  let fontFeatureSettings = $derived(
    [$enableVerticalFontKerning$ && '"vkrn"', $enableFontVPAL$ && '"vpal"']
      .filter((f) => !!f && $verticalMode$)
      .join(', ')
  );

  let bookId = $derived(browser ? Number(page.url.searchParams.get('id')) : 0);
  let rawBookData = $state<BooksDbBookData>();
  let bookData = $state<LoadedBookData>();
  $effect(() => {
    if (!browser) return;

    const abortController = new AbortController();
    void loadReaderBook(bookId, abortController.signal);

    return () => {
      abortController.abort();
    };
  });

  $effect(() => {
    if (!rawBookData) {
      bookData = undefined;
      bookTOCState.setSections([]);
      return;
    }

    bookTOCState.setSections(rawBookData.sections || []);
    logger.debug(
      `reader/bookData: loadBookData start (sections=${rawBookData.sections?.length ?? 0}, htmlLen=${rawBookData.elementHtml?.length ?? 0})`
    );

    const { loadedBookData, cleanup } = loadBookData(
      rawBookData,
      '.book-content',
      document,
      $hideSpoilerImageMode$
    );

    bookData = loadedBookData;

    logger.debug(
      `reader/bookData: loadBookData emitted (htmlLen=${loadedBookData.htmlContent.length})`
    );

    return cleanup;
  });

  async function loadReaderBook(id: number, signal: AbortSignal) {
    let loadedBook: BooksDbBookData | undefined;

    showSpinner = true;
    rawBookData = undefined;
    bookData = undefined;
    bookTOCState.setSections([]);
    bookmarkData = Promise.resolve(undefined);

    try {
      loadedBook = await loadReaderBookData(id);
      if (signal.aborted) return;

      rawBookData = loadedBook;

      if (loadedBook) {
        bookmarkData = database.getBookmark(loadedBook.id);
      } else {
        await goto(resolve(mergeEntries.MANAGE.routeId));
      }
    } catch (error) {
      if (signal.aborted) return;

      showErrorDialog({ title: 'Error loading book', error });
      await goto(resolve(mergeEntries.MANAGE.routeId));
    } finally {
      if (!signal.aborted) {
        logger.debug(
          `reader/rawBookData: finally — showSpinner=false, returning ${
            loadedBook ? `hasHtml=${!!loadedBook.elementHtml}` : 'undefined'
          }`
        );
        showSpinner = false;
      }
    }
  }

  async function loadReaderBookData(id: number) {
    let book: BooksDbBookData | undefined;
    logger.debug(`reader/rawBookData: start id=${id}`);

    book = await openBook(id);
    logger.debug(
      `reader/rawBookData: getBook -> ${
        book
          ? `{id:${book.id}, title:${JSON.stringify(book.title)}, hasHtml:${!!book.elementHtml}}`
          : 'undefined'
      }`
    );

    if (!book) {
      return book;
    }

    const currentContext = {
      id: book.id,
      title: book.title,
      imagePath: book.coverImage
    };

    book.lastBookOpen = new Date().getTime();

    logger.debug('reader/rawBookData: markBookOpened');
    await markBookOpened(book);
    logger.debug('reader/rawBookData: reconcileForBookOpen start');
    await reconcileForBookOpen(currentContext);
    logger.debug('reader/rawBookData: reconcileForBookOpen done');

    // If we started from a placeholder, `reconcileForBookOpen` should have written real content
    // into the `data` row. Re-read so the renderer sees the hydrated book.
    if (!book.elementHtml) {
      const refreshed = await openBook(id);
      if (refreshed) {
        book = refreshed;
      }
      if (!book.elementHtml) {
        throw new Error(
          syncState.location
            ? "This book's content couldn't be loaded from sync — the source file may be corrupt or incomplete. " +
                'Try Force re-sync in Settings → Sync to re-pull it.'
            : "This book's content hasn't been downloaded yet. " +
                'Connect its sync location in Settings → Sync, then try again.'
        );
      }
    }

    if (!$statisticsEnabled$) {
      const wasNew = (
        await database.setFirstBookRead(currentContext.title, $startDayHoursForTracker$)
      )[1];

      if (wasNew) {
        scheduleReplication(StorageDataType.STATISTICS);
      }
    }

    return book;
  }

  let containerViewportWidth = $state(browser ? (visualViewport?.width ?? 0) : 0);
  let containerViewportHeight = $state(browser ? (visualViewport?.height ?? 0) : 0);

  $effect(() => {
    if (!browser) return;

    updateContainerViewportSize();
    const viewport = visualViewport;
    if (!viewport) return;

    viewport.addEventListener('resize', updateContainerViewportSize);
    return () => viewport.removeEventListener('resize', updateContainerViewportSize);
  });

  function updateContainerViewportSize() {
    containerViewportWidth = visualViewport?.width || 0;
    containerViewportHeight = visualViewport?.height || 0;
  }

  let themeOption = $derived(
    availableThemes.get($theme$) || $customThemes$[$theme$] || availableThemes.get('light-theme')!
  );

  $effect(() => {
    if (!browser) return;

    document.body.style.setProperty('background-color', themeOption.backgroundColor);
    return () => document.body.style.removeProperty('background-color');
  });

  $effect(() => {
    if (!browser) return;

    document.documentElement.style.setProperty('writing-mode', $writingMode$);
    return () => document.documentElement.style.removeProperty('writing-mode');
  });

  $effect(() => {
    if (!browser) return;

    let selectionTimer: number | undefined;
    const updateAfterSelectionSettles = () => {
      window.clearTimeout(selectionTimer);
      selectionTimer = window.setTimeout(updateLastSelectedRange, 200);
    };

    document.addEventListener('selectionchange', updateAfterSelectionSettles);
    return () => {
      window.clearTimeout(selectionTimer);
      document.removeEventListener('selectionchange', updateAfterSelectionSettles);
    };
  });

  function updateLastSelectedRange() {
    const currentSelected = window.getSelection()?.toString() || '';

    if (!currentSelected && lastSelectedRangeWasEmpty) {
      lastSelectedRange = undefined;
    } else if (currentSelected) {
      lastSelectedRange = window.getSelection()?.getRangeAt(0);
      lastSelectedRangeWasEmpty = false;
    } else {
      lastSelectedRangeWasEmpty = true;
    }
  }

  $effect(() => {
    if (!browser || !$statisticsEnabled$ || $trackerAutostartTime$ <= 0) return;

    const abortController = new AbortController();
    let autoStartTimer: number | undefined;
    const cleanup = () => {
      window.clearTimeout(autoStartTimer);
      abortController.abort();
    };
    const scheduleAutoStart = () => {
      window.clearTimeout(autoStartTimer);
      autoStartTimer = window.setTimeout(() => {
        cleanup();
        resumeTrackerFor('manual');
      }, $trackerAutostartTime$ * 1000);
    };

    document.addEventListener(PAGE_CHANGE, scheduleAutoStart, {
      signal: abortController.signal
    });

    return cleanup;
  });

  $effect(() => {
    if (bookTOCState.isOpen) {
      untrack(() => readerController.stopAutoScrollIfAvailable());
    }

    if (!$statisticsEnabled$) {
      wasTOCOpen = bookTOCState.isOpen;
      return;
    }

    if (bookTOCState.isOpen && !wasTOCOpen) {
      resumeTrackerAfterTOCCloses = !trackerStatus.paused;
      pauseTrackerFor('toc');
    } else if (!bookTOCState.isOpen && wasTOCOpen) {
      resumeTrackerFor('toc');
    }

    wasTOCOpen = bookTOCState.isOpen;
  });

  $effect(() => {
    if (!trackerStatus.menuOpen && wasTrackerMenuOpen) {
      bookCompleted = false;
    }

    wasTrackerMenuOpen = trackerStatus.menuOpen;
  });

  $effect(() => {
    if (browser && bookCharCount) {
      document.dispatchEvent(new CustomEvent(PAGE_CHANGE, { detail: { exploredCharCount } }));
    }
  });

  $effect(() => {
    if (browser) {
      document.dispatchEvent(new CustomEvent(PAGE_CHANGE, { detail: { bookCharCount } }));
    }
  });

  $effect(() => {
    if (!showCustomReadingPoint) return;

    return untrack(() => {
      pauseTracker('custom-reading-point');

      pulseElement(customReadingPointRange?.endContainer?.parentElement, 'add', 1);

      let clicksToSkip = 1;
      const abortController = new AbortController();
      document.addEventListener(
        'click',
        () => {
          if (clicksToSkip) {
            clicksToSkip -= 1;
            return;
          }

          abortController.abort();
          showCustomReadingPoint = false;
          pulseElement(customReadingPointRange?.endContainer?.parentElement, 'remove', 1);
          restartTrackerAfterCharacterChangeOrTime('custom-reading-point', 1);
        },
        { signal: abortController.signal }
      );

      return () => abortController.abort();
    });
  });

  $effect(() => {
    if (frozenPosition !== -1 && exploredCharCount >= frozenPosition) {
      if (untrack(() => skipFirstFreezeChange)) {
        skipFirstFreezeChange = false;
      } else {
        frozenPosition = -1;
      }
    }
  });

  let isPaginated = $derived($viewMode$ === ViewMode.Paginated);

  let firstDimensionMargin = $derived(
    browser && $enableTapEdgeToFlip$ && isPaginated && $verticalMode$
      ? limitToRange(convertRemToPixels(window, 0.5), window.innerWidth, $firstDimensionMargin$)
      : ($firstDimensionMargin$ ?? 0)
  );

  let tapButtonHeight = $derived(`calc(100% - ${showHeader ? 5 : 4}rem)`);
  let tapButtonTop = $derived(`${showHeader ? 3 : 2}rem`);

  $effect(() => {
    bookmarkData.then((data) => {
      hasBookmarkData = !!data;
      storedExploredCharacter = data?.exploredCharCount || 0;
      isBookCompleted = !!data?.completed;
    });
  });

  onDestroy(() => {
    flushReaderStatisticsReplication();
    readerImageGallery.clear();
  });

  function handleUnload(event: BeforeUnloadEvent) {
    if ($confirmClose$ && (isSyncingOrPending() || storedExploredCharacter !== exploredCharCount)) {
      event.preventDefault();

      return (event.returnValue = 'Are you sure you want to exit?');
    }

    return event;
  }

  function toggleTrackerPause() {
    if (!$statisticsEnabled$) {
      return;
    }

    toggleTrackerPauseByUser();
  }

  async function handleJump() {
    if (!readerController.canBookmark || !bookId) {
      return;
    }

    pauseTracker('jump');
    skipKeyDownListener$.next(true);

    const target = await showNumberDialog({
      title: 'Jump to character',
      label: 'Character position',
      actionLabel: 'Jump',
      minValue: 1,
      maxValue: bookCharCount || 1
    });

    skipKeyDownListener$.next(false);

    if (typeof target !== 'number') {
      restartTrackerAfterCharacterChangeOrTime('jump', 1);
      return;
    }

    restartTrackerAfterCharacterChangeOrTime('jump', 1000);

    readerController.scrollToBookmark(
      {
        dataId: bookId,
        exploredCharCount: target,
        lastBookmarkModified: new Date().getTime(),
        progress: 0
      },
      customReadingPointScrollOffset
    );
  }

  async function completeBook() {
    if (!rawBookData || !beginReaderAction()) {
      return;
    }

    try {
      const wasAutoscrollerEnabled = readerController.autoScrollEnabled;
      showHeader = false;
      readerController.stopAutoScrollIfAvailable();

      if ($statisticsEnabled$) {
        pauseTrackerFor('completion');
      }

      const diffToComplete =
        $statisticsEnabled$ && $addCharactersOnCompletion$
          ? Math.max(0, bookCharCount - exploredCharCount)
          : 0;
      const confirmed = await showConfirmDialog({
        title: 'Complete book',
        message: `Would you like to complete this book${
          diffToComplete ? ` and capture ${diffToComplete} characters read` : ''
        }?`,
        confirmLabel: 'Complete'
      });

      if (!confirmed) {
        if ($statisticsEnabled$) {
          resumeTrackerFor('completion');
        }

        if (wasAutoscrollerEnabled) {
          readerController.toggleAutoScrollIfAvailable();
        }

        return;
      }

      if (diffToComplete) {
        await trackerElm.processStatistics(diffToComplete);
      }

      const finishedStatistic = await database.getStatisticForCompletedBook(rawBookData.title);
      const todayKey = getDateKey($startDayHoursForTracker$);
      const statisticsUntilToday = await database.getStatisticsUntilDate(
        rawBookData.title,
        todayKey
      );
      const todayStatistic =
        statisticsUntilToday.find((statistic) => statistic.dateKey === todayKey) ||
        getDefaultStatistic(rawBookData.title, todayKey);
      const statisticsToStore: BooksDbStatistic[] = [];
      const lastStatisticModified = Date.now();

      todayStatistic.lastStatisticModified = lastStatisticModified;
      todayStatistic.completedBook = 1;
      todayStatistic.completedData = {
        ...{ dateKey: todayKey },
        ...BaseStorageHandler.getStatisticsMetadata(
          BaseStorageHandler.getStatisticsFileName(
            statisticsUntilToday,
            todayStatistic.lastStatisticModified
          )
        )
      };

      let updateFinishedStatistic = false;

      if (!finishedStatistic) {
        statisticsToStore.push(todayStatistic);
      } else if (
        $overwriteBookCompletion$ &&
        finishedStatistic.dateKey !== todayStatistic.dateKey
      ) {
        delete finishedStatistic.completedBook;
        delete finishedStatistic.completedData;
        finishedStatistic.lastStatisticModified = lastStatisticModified;
        statisticsToStore.push(todayStatistic, finishedStatistic);
        updateFinishedStatistic = true;
      } else if ($overwriteBookCompletion$) {
        statisticsToStore.push(todayStatistic);
      }

      const ctx = bookReplicationContext();

      if (statisticsToStore.length && ctx) {
        await userSaveStatistics(
          rawBookData.title,
          statisticsToStore,
          ReplicationSaveBehavior.Overwrite,
          'merge',
          ctx,
          lastStatisticModified
        );

        trackerElm?.updateCompletedBook(
          todayStatistic,
          updateFinishedStatistic ? finishedStatistic : undefined
        );
      }

      if (readerController.canBookmark && ctx) {
        const data = {
          ...readerController.formatBookmarkData(rawBookData.id, customReadingPointScrollOffset),
          completed: true
        };

        await userSaveBookmark(data, ctx);

        bookmarkData = Promise.resolve(data);
      }

      if ($statisticsEnabled$ && $openTrackerOnCompletion$) {
        confettiWidthModifier = 36;
        confettiMaxRuns = 0;
        bookCompleted = window.matchMedia('(min-width: 900px)').matches;
        openTrackerMenu();
      } else {
        confettiWidthModifier = 0;
        confettiMaxRuns = 3;
        bookCompleted = true;

        dismissCompletionConfettiOnPointerUpOrTimeout();
      }
    } catch (error) {
      showErrorDialog({ title: 'Error completing book', error });
    } finally {
      endReaderAction();
    }
  }

  async function uncompleteBook() {
    if (!beginReaderAction()) {
      return;
    }

    try {
      const ctx = bookReplicationContext();
      if (!bookId || !ctx || !readerController.canBookmark) return;

      const data = {
        ...readerController.formatBookmarkData(bookId, customReadingPointScrollOffset),
        completed: false
      };

      await userSaveBookmark(data, ctx);

      bookmarkData = Promise.resolve(data);
    } finally {
      endReaderAction();
    }
  }

  function getCurrentChapterProgress() {
    const currentChapter = bookTOCState.currentChapter;
    if (
      (!$showFooterChapterCharacterCounter$ && !$showFooterChapterPercentage$) ||
      !currentChapter
    ) {
      return '';
    }

    let chapterProgress = '';
    let chapterCharacters = '';

    if ($showFooterChapterPercentage$) {
      chapterProgress = `${bookTOCState.currentChapterProgress.toFixed(2)}%`;
    }

    if ($showFooterChapterCharacterCounter$) {
      const endCharacter = currentChapter.characters;

      chapterCharacters = `${Math.min(
        Math.max(exploredCharCount - currentChapter.startCharacter, 0),
        endCharacter
      )} / ${endCharacter}`;
    }

    return [chapterCharacters, chapterProgress, 'C'].filter(Boolean).join(' ');
  }

  function copyCurrentProgress(currentProgress: string) {
    try {
      navigator.clipboard.writeText(currentProgress);
    } catch (error: any) {
      logger.error(`Error writing Progress to Clipboard: ${error.message}`);
    }
  }

  function freezeTrackerPosition() {
    if (!$statisticsEnabled$) {
      return;
    }

    if (frozenPosition > -1) {
      frozenPosition = -1;
    } else {
      skipFirstFreezeChange = true;
      frozenPosition = exploredCharCount;
    }
  }

  function onKeydown(ev: KeyboardEvent) {
    handleReaderKeydown(ev, {
      bookmarkPage,
      changeChapter,
      freezeTrackerPosition,
      handleSetCustomReadingPoint,
      isPaginated,
      isVertical: $verticalMode$,
      multiplierOffsetFn: (x) => multiplier$.next(multiplier$.getValue() + x),
      readerController,
      scrollToBookmark,
      shortcutsDisabled: readerActionPending || $skipKeyDownListener$,
      toggleTracker: toggleTrackerPause
    });
  }

  function beginReaderAction() {
    if (readerActionPending) {
      return false;
    }

    readerActionPending = true;
    return true;
  }

  function endReaderAction() {
    readerActionPending = false;
  }

  async function bookmarkPage() {
    if (!bookId || !readerController.canBookmark) return;

    let data: BooksDbBookmarkData;

    showHeader = false;

    if (isPaginated) {
      const userSelectedRange = $selectionToBookmarkEnabled$
        ? getRangeForUserSelection(window, lastSelectedRange)
        : undefined;
      const bookmarkRange = userSelectedRange || customReadingPointRange;

      pulseElement(bookmarkRange?.endContainer?.parentElement, 'add', 0.5, 500);

      data = readerController.formatBookmarkDataByRange(bookId, bookmarkRange);

      if (userSelectedRange) {
        clearRange(window);
      }
    } else {
      data = readerController.formatBookmarkData(bookId, customReadingPointScrollOffset);
    }

    const existingData = await bookmarkData;
    if (existingData?.completed) {
      data.completed = true;
    }

    const ctx = bookReplicationContext();
    if (ctx) {
      await userSaveBookmark(data, ctx);
    } else {
      await database.putBookmark(data);
    }

    bookmarkData = Promise.resolve(data);
  }

  async function scrollToBookmark() {
    const data = await bookmarkData;
    if (!data || !readerController.canBookmark) return;

    if (data.exploredCharCount !== exploredCharCount) {
      pauseTracker('jump', true);
    }

    readerController.scrollToBookmark(data, customReadingPointScrollOffset);
  }

  function onFullscreenClick() {
    showHeader = false;

    if (!fullscreenManager.fullscreenElement) {
      fullscreenManager.requestFullscreen(document.documentElement);
      return;
    }
    fullscreenManager.exitFullscreen();
  }

  function changeChapter(offset: number) {
    if (!bookTOCState.hasChapters) {
      return;
    }

    if (
      (!bookTOCState.currentChapterIndex && offset === -1) ||
      (offset === 1 && bookTOCState.currentChapterIndex === bookTOCState.mainChapters.length - 1)
    ) {
      return;
    }

    const nextChapter = bookTOCState.chapterAtOffset(offset);

    if (!nextChapter) {
      return;
    }

    if (nextChapter.startCharacter !== exploredCharCount) {
      pauseTracker('jump', true);
    }

    readerController.goToChapter(nextChapter.reference);
  }

  async function leaveReader(routeId: ReaderExitRoute, deleteLastItem = true) {
    if (!beginReaderAction()) {
      return;
    }

    try {
      try {
        await tick();

        readerController.stopAutoScrollIfAvailable();
        pauseTrackerFor('leaving-reader');

        if ($confirmClose$ && storedExploredCharacter !== exploredCharCount) {
          const confirmed = await showConfirmDialog({
            title: 'Confirm exit',
            message: 'Your current location was not bookmarked. Continue leaving?',
            confirmLabel: 'Continue'
          });

          if (!confirmed) {
            resumeTrackerFor('leaving-reader');
            return;
          }

          await tick();
        }

        if (deleteLastItem) {
          await database.deleteLastItem();
        }

        if (!$manualBookmark$) {
          await bookmarkPage();
        }

        if ($statisticsEnabled$ && trackerElm) {
          // Sync trigger rides the tracker's onstatisticssaved callback.
          await trackerElm.flushUpdates();
          flushReaderStatisticsReplication();
        }
      } catch (error) {
        showErrorDialog({ title: 'Error saving reader state', error });
      }

      if (routeId === mergeEntries.STATISTICS.routeId && bookId) {
        await goto(resolve(getBookStatisticsURL(bookId)));
      } else {
        await goto(resolve(routeId));
      }
    } finally {
      endReaderAction();
    }
  }

  function handleSetCustomReadingPoint() {
    if (!$customReadingPointEnabled$ && !isPaginated) {
      return;
    }

    const contentEl = document.querySelector('.book-content');

    if (!contentEl) {
      return;
    }

    readerController.stopAutoScrollIfAvailable();

    if ($pauseTrackerOnCustomPointChange$) {
      pauseTracker('custom-reading-point');
    }

    if (isPaginated) {
      customReadingPointTop = window.innerHeight / 2 - 2;
      customReadingPointLeft = window.innerWidth / 2 - 2;
    }

    showHeader = false;
    isSelectingCustomReadingPoint = true;
    document.body.classList.add('cursor-crosshair');

    const {
      elLeftReferencePoint,
      elTopReferencePoint,
      elRightReferencePoint,
      elBottomReferencePoint,
      pointGap
    } = getReferencePoints(window, contentEl, $verticalMode$, firstDimensionMargin);

    const abortController = new AbortController();
    const handlePointer = (event: PointerEvent) => {
      if (!(event instanceof PointerEvent)) {
        return;
      }

      if (event.type === 'pointerup') {
        abortController.abort();
        document.body.classList.remove('cursor-crosshair');
        isSelectingCustomReadingPoint = false;

        tick().then(() => {
          customReadingPointLeft = $verticalMode$ ? event.x : customReadingPointLeft;
          customReadingPointTop = $verticalMode$ ? customReadingPointTop : event.y;

          const result = getParagraphToPoint(customReadingPointLeft, customReadingPointTop);

          if (result) {
            pulseElement(result.parent, 'add', 0.5, 500);
          }

          if (isPaginated) {
            customReadingPointRange = result?.range;
          } else {
            let newPercentage: number;

            if ($verticalMode$) {
              newPercentage = Math.ceil(
                (Math.max(0, customReadingPointLeft - elLeftReferencePoint) /
                  (elRightReferencePoint - elLeftReferencePoint)) *
                  100
              );

              verticalCustomReadingPosition$.next(newPercentage);
            } else {
              newPercentage = Math.ceil(
                (Math.max(0, customReadingPointTop - elTopReferencePoint) /
                  (elBottomReferencePoint - elTopReferencePoint)) *
                  100
              );

              horizontalCustomReadingPosition$.next(newPercentage);
            }

            customReadingPoint = newPercentage;
          }

          if ($pauseTrackerOnCustomPointChange$) {
            restartTrackerAfterCharacterChangeOrTime('custom-reading-point', 1000);
          }
        });
      } else {
        const insideXBound =
          event.x >= elLeftReferencePoint + pointGap && event.x <= elRightReferencePoint;
        const insideYBound =
          event.y >= elTopReferencePoint && event.y <= elBottomReferencePoint - pointGap;

        if (isPaginated) {
          customReadingPointTop = insideYBound ? event.y : customReadingPointTop;
          customReadingPointLeft = insideXBound ? event.x : customReadingPointLeft;
        } else if ($verticalMode$ && insideXBound) {
          customReadingPointLeft = event.x;
        } else if (!$verticalMode$ && insideYBound) {
          customReadingPointTop = event.y;
        }
      }
    };

    document.addEventListener('pointerup', handlePointer, { signal: abortController.signal });
    document.addEventListener('pointermove', handlePointer, { signal: abortController.signal });
  }

  function handleResize() {
    if (!$statisticsEnabled$ || trackerStatus.paused) {
      return;
    }

    pauseTracker('resize');

    runAfterPageChangeOrTimeout({
      timeoutMs: 1_000,
      debounceMs: 1_000,
      callback: () => restartTrackerAfterCharacterChangeOrTime('resize', 1_000)
    });
  }

  function pauseTracker(reason: TrackerPauseReason = 'jump', restartAfterCharacterChange = false) {
    if ($statisticsEnabled$ && !trackerStatus.paused) {
      pauseTrackerFor(reason);

      if (restartAfterCharacterChange) {
        restartTrackerAfterCharacterChangeOrTime(reason);
      }
    }
  }

  function restartTrackerAfterCharacterChangeOrTime(
    reason: TrackerPauseReason = 'jump',
    timerAmount = 0
  ) {
    if (!$statisticsEnabled$) {
      return;
    }

    runAfterPageChangeOrTimeout({
      timeoutMs: timerAmount,
      debounceMs: 200,
      callback: () => resumeTrackerFor(reason)
    });
  }

  function dismissCompletionConfettiOnPointerUpOrTimeout() {
    const abortController = new AbortController();
    const timeout = window.setTimeout(dismiss, 10_000);

    function dismiss() {
      window.clearTimeout(timeout);
      abortController.abort();
      bookCompleted = false;
    }

    document.addEventListener('pointerup', dismiss, {
      once: true,
      signal: abortController.signal
    });
  }

  function runAfterPageChangeOrTimeout({
    timeoutMs,
    debounceMs,
    callback
  }: {
    timeoutMs?: number;
    debounceMs: number;
    callback: () => void;
  }) {
    const abortController = new AbortController();
    let timeout: number | undefined;
    let debounceTimer: number | undefined;

    const cleanup = () => {
      window.clearTimeout(timeout);
      window.clearTimeout(debounceTimer);
      abortController.abort();
    };
    const scheduleCallback = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        cleanup();
        callback();
      }, debounceMs);
    };

    document.addEventListener(PAGE_CHANGE, scheduleCallback, { signal: abortController.signal });

    if (timeoutMs) {
      timeout = window.setTimeout(scheduleCallback, timeoutMs);
    }

    return cleanup;
  }

  function bookReplicationContext(): ReplicationContext | undefined {
    if (!rawBookData) return undefined;
    return {
      id: rawBookData.id,
      title: rawBookData.title,
      imagePath: rawBookData.coverImage
    };
  }

  /**
   * Forward a local-edit event to the sync engine for trigger-only
   * paths where the write happened elsewhere (e.g. the tracker's
   * onstatisticssaved callback). Paired writes go through
   * library.user* directly.
   */
  function scheduleReaderStatisticsReplication() {
    readerStatisticsSyncDirty = true;

    const now = Date.now();
    const elapsed = now - lastReaderStatisticsSyncAt;
    if (elapsed >= READER_STATISTICS_SYNC_THROTTLE_MS) {
      lastReaderStatisticsSyncAt = now;
      scheduleReplication(StorageDataType.STATISTICS);
      return;
    }

    scheduleReplication(StorageDataType.STATISTICS, {
      debounceMs: READER_STATISTICS_SYNC_THROTTLE_MS - elapsed
    });
  }

  function flushReaderStatisticsReplication() {
    if (!readerStatisticsSyncDirty) return;

    readerStatisticsSyncDirty = false;
    lastReaderStatisticsSyncAt = Date.now();
    scheduleReplication(StorageDataType.STATISTICS, { immediate: true });
  }

  function scheduleReplication(
    dataType: StorageDataType,
    { debounceMs, immediate = false }: { debounceMs?: number; immediate?: boolean } = {}
  ) {
    const ctx = bookReplicationContext();
    if (!ctx) return;

    if (dataType === StorageDataType.DATA) {
      syncAfterLocalMutation({ kind: 'book-data', context: ctx });
    } else if (dataType === StorageDataType.PROGRESS) {
      syncAfterLocalMutation({ kind: 'progress', context: ctx });
    } else if (dataType === StorageDataType.STATISTICS) {
      syncAfterLocalMutation({ kind: 'statistics', context: ctx, debounceMs, immediate });
    }
  }
</script>

<svelte:head>
  <title>{formatPageTitle(rawBookData?.title ?? '')}</title>
</svelte:head>

<button
  class="fixed inset-x-0 top-0 z-10 h-8 w-full"
  aria-label="Show reader header"
  disabled={readerActionPending}
  onclick={() => {
    if (!readerActionPending) {
      showHeader = true;
    }
  }}
></button>
<div
  aria-label="Reader controls"
  role="toolbar"
  class="elevation-4 writing-horizontal-tb fixed inset-x-0 top-0 z-10 w-full transform-gpu transition-[opacity,translate] duration-150 ease-in-out"
  inert={!showHeader || readerActionPending}
  class:opacity-0={!showHeader}
  style:translate={showHeader ? undefined : '0 -100%'}
  use:clickOutside={() => (showHeader = false)}
>
  <BookReaderHeader
    hasChapterData={bookTOCState.hasChapters}
    hasText={!!bookCharCount}
    hasCustomReadingPoint={!!(
      ($customReadingPointEnabled$ || isPaginated) &&
      ((isPaginated && customReadingPointRange) ||
        (!isPaginated && customReadingPointLeft > -1 && customReadingPointTop > -1))
    )}
    showFullscreenButton={fullscreenManager.fullscreenEnabled}
    autoScrollMultiplier={$multiplier$}
    {hasBookmarkData}
    {isBookmarkScreen}
    ontocClick={() => {
      showHeader = false;
      bookTOCState.isOpen = true;
    }}
    onjumpClick={handleJump}
    {isBookCompleted}
    oncompleteBook={completeBook}
    onuncompleteBook={uncompleteBook}
    onsetCustomReadingPoint={handleSetCustomReadingPoint}
    onshowCustomReadingPoint={() => {
      showHeader = false;
      showCustomReadingPoint = true;
    }}
    onresetCustomReadingPoint={() => {
      showHeader = false;

      if ($pauseTrackerOnCustomPointChange$) {
        pauseTracker('custom-reading-point');
      }

      if (isPaginated) {
        customReadingPointRange = undefined;
      } else if ($verticalMode$) {
        verticalCustomReadingPosition$.next(100);
        customReadingPoint = 100;
      } else {
        horizontalCustomReadingPosition$.next(0);
        customReadingPoint = 0;
      }

      if ($pauseTrackerOnCustomPointChange$) {
        restartTrackerAfterCharacterChangeOrTime('custom-reading-point', 1000);
      }
    }}
    onfullscreenClick={onFullscreenClick}
    onbookmarkClick={bookmarkPage}
    onscrollToBookmarkClick={() => {
      showHeader = false;
      scrollToBookmark();
    }}
    onstatisticsClick={() => leaveReader(mergeEntries.STATISTICS.routeId, false)}
    onreaderImageGalleryClick={() => {
      showHeader = false;
      showReaderImageGallery = true;
    }}
    onsettingsClick={() => leaveReader(mergeEntries.SETTINGS.routeId, false)}
    onbookManagerClick={() => leaveReader(mergeEntries.MANAGE.routeId)}
  />
</div>

{#if bookData && rawBookData}
  {#if $statisticsEnabled$}
    <BookReadingTracker
      fontColor={themeOption.fontColor}
      backgroundColor={themeOption.backgroundColor}
      bookTitle={rawBookData.title}
      currentChapter={bookTOCState.currentChapter}
      {frozenPosition}
      {exploredCharCount}
      {bookCharCount}
      {readerController}
      bind:this={trackerElm}
      onfreezecurrentlocation={freezeTrackerPosition}
      onstatisticssaved={scheduleReaderStatisticsReplication}
    />
  {/if}
  <StyleSheetRenderer styleSheet={bookData.styleSheet} />
  <BookReader
    htmlContent={bookData.htmlContent}
    width={containerViewportWidth}
    height={containerViewportHeight}
    {fontFeatureSettings}
    verticalTextOrientation={$verticalMode$ ? $verticalTextOrientation$ : ''}
    prioritizeReaderStyles={$prioritizeReaderStyles$}
    enableTextJustification={$enableTextJustification$}
    enableTextWrapPretty={$enableTextWrapPretty$}
    verticalMode={$verticalMode$}
    fontColor={themeOption.fontColor}
    backgroundColor={themeOption.backgroundColor}
    hintFuriganaFontColor={themeOption.hintFuriganaFontColor}
    hintFuriganaShadowColor={themeOption.hintFuriganaShadowColor}
    fontFamilyGroupOne={$fontFamilyGroupOne$}
    fontFamilyGroupTwo={$fontFamilyGroupTwo$}
    fontSize={$fontSize$}
    lineHeight={$lineHeight$}
    textIndentation={$textIndentation$}
    textMarginMode={$textMarginMode$}
    textMarginValue={$textMarginValue$}
    hideSpoilerImage={$hideSpoilerImage$}
    furiganaStyle={$furiganaStyle$}
    viewMode={$viewMode$}
    secondDimensionMaxValue={$secondDimensionMaxValue$}
    {firstDimensionMargin}
    autoPositionOnResize={$autoPositionOnResize$}
    avoidPageBreak={$avoidPageBreak$}
    pageColumns={$pageColumns$}
    autoBookmark={$autoBookmark$}
    autoBookmarkTime={$autoBookmarkTime$}
    multiplier={$multiplier$}
    bind:exploredCharCount
    {bookmarkData}
    {customReadingPoint}
    bind:customReadingPointTop
    bind:customReadingPointLeft
    bind:customReadingPointScrollOffset
    bind:customReadingPointRange
    {readerController}
    onhideCustomReadingPoint={() => (showCustomReadingPoint = false)}
    onbookcharcountchange={(count) => (bookCharCount = count)}
    onisbookmarkscreenchange={(value) => (isBookmarkScreen = value)}
    onbookmark={bookmarkPage}
  />
{/if}

<SidebarOverlay
  bind:open={bookTOCState.isOpen}
  side="left"
  class="overflow-hidden bg-background-color text-(--font-color)"
  closeTitle="Close table of contents"
  style={`color: ${themeOption.fontColor}; background-color: ${themeOption.backgroundColor};`}
>
  {#if bookTOCState.hasChapters}
    <BookTOC
      {readerController}
      verticalMode={$verticalMode$}
      {exploredCharCount}
      {resumeTrackerAfterTOCCloses}
    />
  {/if}
</SidebarOverlay>

{#if showReaderImageGallery}
  <BookReaderImageGallery
    fontColor={themeOption.fontColor}
    backgroundColor={themeOption.backgroundColor}
    onclose={() => (showReaderImageGallery = false)}
  />
{/if}

{#if (isSelectingCustomReadingPoint && !$isMobile$) || (!isPaginated && showCustomReadingPoint)}
  <div
    class="fixed left-0 z-20 h-px w-full border border-red-500"
    style:top={`${customReadingPointTop}px`}
  ></div>
  <div
    class="fixed top-0 z-20 h-full w-px border border-red-500"
    style:left={`${customReadingPointLeft}px`}
  ></div>
{/if}

{#if $enableTapEdgeToFlip$ && isPaginated && !$skipKeyDownListener$}
  <button
    class="fixed left-0 z-10 w-5"
    aria-label={$verticalMode$ ? 'Next page' : 'Previous page'}
    disabled={!readerController.canPage}
    onclick={$verticalMode$ ? () => readerController.nextPage() : () => readerController.prevPage()}
    style:height={tapButtonHeight}
    style:top={tapButtonTop}
  ></button>
  <button
    class="fixed right-0 z-10 w-5"
    aria-label={$verticalMode$ ? 'Previous page' : 'Next page'}
    disabled={!readerController.canPage}
    onclick={$verticalMode$ ? () => readerController.prevPage() : () => readerController.nextPage()}
    style:height={tapButtonHeight}
    style:top={tapButtonTop}
  ></button>
{/if}

{#if showSpinner}
  <div class="fixed inset-0 flex size-full items-center justify-center text-7xl">
    <Fa icon={faSpinner} spin />
  </div>
{/if}

<div
  id="miwake-page-footer"
  tabindex="0"
  role="button"
  class="writing-horizontal-tb fixed bottom-0 left-0 z-10 flex h-8 w-full items-center justify-end text-xs leading-none"
  style:color={themeOption.tooltipTextFontColor}
  onclick={() => (showFooter = !showFooter)}
  onkeyup={dummyFn}
>
  {#if showFooter && bookCharCount}
    {@const footerChapterProgress = getCurrentChapterProgress()}
    {@const currentProgress = [
      $showCharacterCounter$ ? `${exploredCharCount} / ${bookCharCount}` : '',
      $showPercentage$ ? `${((exploredCharCount / bookCharCount) * 100).toFixed(2)}%` : '',
      $showFooterChapterCharacterCounter$ || $showFooterChapterPercentage$ ? 'T' : ''
    ]
      .filter(Boolean)
      .join(' ')}
    <div
      tabindex="0"
      role="button"
      title="Click to copy progress"
      class="writing-horizontal-tb fixed bottom-2 right-2 z-10 text-xs leading-none select-none whitespace-pre"
      class:invisible={!$showCharacterCounter$ &&
        !$showPercentage$ &&
        !$showFooterChapterCharacterCounter$ &&
        !$showFooterChapterPercentage$}
      style:color={themeOption.tooltipTextFontColor}
      onclick={(e) => {
        e.stopPropagation();
        if (!$showCharacterCounter$ && !$showPercentage$) {
          return;
        }

        copyCurrentProgress(currentProgress.replace(/ T$/, ''));

        const target = e.target;
        if (target instanceof HTMLElement) {
          pulseElement(target.parentElement || target, 'add', 0.5, 500);
        }
      }}
      onkeyup={dummyFn}
    >
      <span class="mr-4" class:invisible={!footerChapterProgress}>{footerChapterProgress}</span>
      <span class:invisible={!$showCharacterCounter$ && !$showPercentage$}>{currentProgress}</span>
    </div>
  {/if}
</div>

{#if bookCompleted}
  <BookCompletionConfetti {confettiWidthModifier} {confettiMaxRuns} {window} />
{/if}

<svelte:window onkeydown={onKeydown} onbeforeunload={handleUnload} onresize={handleResize} />
