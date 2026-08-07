<script lang="ts">
  import { browser } from '$app/environment';
  import { bookTOCState } from '$lib/components/book-reader/book-toc/book-toc-state.svelte';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { deviceEnvironment } from '$lib/data/device-environment.svelte';
  import { isStoredFont } from '$lib/data/fonts';
  import { FuriganaStyle } from '$lib/data/furigana-style';
  import { logger } from '$lib/data/logger';
  import { appShortcuts } from '$lib/data/app-shortcuts.svelte';
  import type { TextMarginMode } from '$lib/data/text-margin-mode';
  import {
    disableWheelNavigation$,
    firstDimensionMargin$,
    selectionToBookmarkEnabled$,
    swipeThreshold$,
    userFonts$
  } from '$lib/data/store';
  import { clearRange, createRange, pulseElement } from '$lib/functions/range-util';
  import { faBookmark, faSpinner } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';
  import { useSwipe, type SwipeCustomEvent } from 'svelte-gestures';
  import type { BookReaderController } from '../book-reader-controller.svelte';
  import { BookmarkManagerPaginated } from './bookmark-manager-paginated';
  import { PageManagerPaginated } from './page-manager-paginated';
  import { SectionCharacterStatsCalculator } from './section-character-stats-calculator';
  import { onDestroy, onMount, untrack } from 'svelte';

  interface Props {
    htmlContent: string;
    width: number;
    height: number;
    verticalMode: boolean;
    fontFeatureSettings: string;
    verticalTextOrientation: string;
    prioritizeReaderStyles: boolean;
    enableTextJustification: boolean;
    enableTextWrapPretty: boolean;
    fontColor: string;
    backgroundColor: string;
    hintFuriganaFontColor: string;
    hintFuriganaShadowColor: string;
    fontFamilyGroupOne: string;
    fontFamilyGroupTwo: string;
    fontSize: number;
    lineHeight: number;
    textIndentation: number;
    textMarginMode: TextMarginMode;
    textMarginValue: number;
    hideSpoilerImage: boolean;
    furiganaStyle: FuriganaStyle;
    loadingState: boolean;
    bookmarkData: Promise<BooksDbBookmarkData | undefined>;
    avoidPageBreak?: boolean;
    pageColumns: number;
    firstDimensionMargin: number;
    autoBookmark?: boolean;
    autoBookmarkTime: number;
    exploredCharCount?: number;
    customReadingPointRange?: Range | undefined;
    readerController: BookReaderController;
    onhideCustomReadingPoint?: () => void;
    onbookcharcountchange?: (count: number) => void;
    onisbookmarkscreenchange?: (value: boolean) => void;
    onbookmark?: () => void;
    oncontentchange?: (el: HTMLElement) => void;
  }

  let {
    htmlContent,
    width,
    height,
    verticalMode,
    fontFeatureSettings,
    verticalTextOrientation,
    prioritizeReaderStyles,
    enableTextJustification,
    enableTextWrapPretty,
    fontColor,
    backgroundColor,
    hintFuriganaFontColor,
    hintFuriganaShadowColor,
    fontFamilyGroupOne,
    fontFamilyGroupTwo,
    fontSize,
    lineHeight,
    textIndentation,
    textMarginMode,
    textMarginValue,
    hideSpoilerImage,
    furiganaStyle,
    loadingState,
    bookmarkData,
    avoidPageBreak = true,
    pageColumns,
    firstDimensionMargin,
    autoBookmark = false,
    autoBookmarkTime,
    exploredCharCount = $bindable(0),
    customReadingPointRange = $bindable(),
    readerController,
    onhideCustomReadingPoint,
    onbookcharcountchange,
    onisbookmarkscreenchange,
    onbookmark,
    oncontentchange
  }: Props = $props();

  let scrollEl = $state<HTMLElement>();

  let contentEl = $state<HTMLElement>();

  let calculator = $state<SectionCharacterStatsCalculator>();

  let sections: Element[] = $state([]);

  let pageManager: PageManagerPaginated | undefined;

  let bookmarkManager: BookmarkManagerPaginated | undefined;

  let scrollWhenReady: boolean = $state(false);

  let allowDisplay = $state(false);

  let displayedHtml = $state('');

  let previousIntendedCount = 0;

  let useExploredCharCount = false;

  let isResizing = $state(false);

  let resizeIntendedCount: number | undefined;

  let isBookmarkScreen = $state(false);

  let bookmarkTopAdjustment = $state<string>();

  let bookmarkLeftAdjustment = $state<string>();

  let bookmarkRightAdjustment = $state<string>();

  let fontLoadingAdded = false;

  let currentSectionId = $state('');

  let displayedSectionVersion = $state(0);

  let readerState = $state({
    sectionIndex: -1,
    virtualScrollPos: 0
  });

  let sectionReadyIndex = -1;

  let sectionReadyWaiters: {
    index: number;
    resolve: (calculator: SectionCharacterStatsCalculator) => void;
  }[] = [];

  let autoBookmarkTimer: number | undefined;

  const gap = 40;

  let columnCount = $derived(verticalMode ? 1 : pageColumns || Math.ceil(width / 1000));

  // Extra width so the overflow:hidden padding box extends beyond the content,
  // giving furigana room on the right edge in vertical-rl mode.
  let furiganaExtra = $derived(verticalMode ? 10 : 0);

  // bookmarkData: when it changes, reset useExploredCharCount and update bookmark screen
  $effect(() => {
    bookmarkData.then((data) => {
      useExploredCharCount = false;
      updateBookmarkScreen(data);
    });
  });

  // Initialize content when displayedHtml changes (section navigation).
  // Skip only the initial empty state (before any section loads); after that,
  // process all sections including empty ones (blank spine items / separators).
  let contentInitialized = false;
  $effect(() => {
    if (!displayedSectionVersion || (!contentInitialized && !displayedHtml) || !scrollEl) return;

    contentInitialized = true;
    untrack(() => initContent(scrollEl!));
  });

  // When htmlContent changes, parse sections and reset sectionIndex
  $effect(() => {
    if (browser && htmlContent) {
      scrollWhenReady = true;
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = htmlContent;
      sections = Array.from(tempContainer.children);
      resetSectionIndex(0);
    }
  });

  $effect(() => {
    const index = readerState.sectionIndex;
    if (index < 0) return;

    const html = sections[index]?.innerHTML || '';
    allowDisplay = false;

    let cancelled = false;
    // Let Svelte apply the loading state before the follow-up effect reads the new section DOM.
    requestAnimationFrame(() => {
      if (cancelled) return;

      displayedHtml = html;
      displayedSectionVersion += 1;
    });

    return () => {
      cancelled = true;
    };
  });

  // Create/recreate PageManager and BookmarkManager when dependencies change.
  $effect(() => {
    if (!contentEl || !scrollEl || !sections.length || !calculator) {
      return undefined;
    }

    pageManager = new PageManagerPaginated({
      contentEl,
      scrollEl,
      tocSections: bookTOCState.sections,
      sections,
      setSectionProgress: (sectionProgress) => bookTOCState.setSectionProgress(sectionProgress),
      readerState,
      setSectionIndexAndWait,
      width,
      height,
      pageGap: gap,
      verticalMode,
      onPageChange: handlePageChange
    });
    const cleanupPageManager = readerController.registerPageManager(pageManager);

    bookmarkManager = new BookmarkManagerPaginated({
      calculator,
      pageManager,
      readerState,
      setSectionIndexAndWait,
      setIntendedCharCount: (c) => (previousIntendedCount = c)
    });
    const cleanupBookmarkManager = readerController.registerBookmarkManager(bookmarkManager);

    return () => {
      cleanupPageManager();
      cleanupBookmarkManager();
      pageManager = undefined;
      bookmarkManager = undefined;
    };
  });

  // On content display change
  $effect(() => {
    if (calculator && width && height && !loadingState) {
      const currentCalculator = calculator;
      requestAnimationFrame(() => {
        onContentDisplayChange(currentCalculator);
      });
    }
  });

  // React to customReadingPointRange changes
  $effect(() => {
    if (!calculator) return;

    exploredCharCount = calculator.calcExploredCharCount(customReadingPointRange);
    previousIntendedCount = exploredCharCount;

    updateSectionData(customReadingPointRange);
  });

  onMount(() => {
    // because Yomitan popup creates overflow on vertical-rl
    document.body.classList.add('overflow-hidden');

    return () => {
      document.body.classList.remove('overflow-hidden');
    };
  });

  onMount(() => readerController.registerChapterNavigator(goToChapter));

  let hasMeasuredSize = false;
  $effect(() => {
    const currentWidth = width;
    const currentHeight = height;
    if (!currentWidth || !currentHeight) return;

    if (!hasMeasuredSize) {
      hasMeasuredSize = true;
      return;
    }

    const targetSectionIndex = untrack(() => readerState.sectionIndex);
    const intendedCount = untrack(() => resizeIntendedCount ?? previousIntendedCount);
    void waitForNextSectionReady(targetSectionIndex).then((updatedCalculator) => {
      if (width !== currentWidth || height !== currentHeight || !pageManager) return;

      updatedCalculator.updateParagraphPos();

      const scrollPos = updatedCalculator.getScrollPosByCharCount(intendedCount);
      if (scrollPos < 0) {
        resizeIntendedCount = undefined;
        isResizing = false;
        return;
      }

      pageManager.scrollTo(scrollPos, false);
      resizeIntendedCount = undefined;
      isResizing = false;
    });
  });

  function handleResize() {
    isResizing = true;
    resizeIntendedCount ??= previousIntendedCount;
  }

  function handlePageChange(isUser: boolean) {
    if (!calculator) return;

    if (!isResizing) {
      onhideCustomReadingPoint?.();

      pulseElement(customReadingPointRange?.endContainer?.parentElement, 'remove', 1);

      customReadingPointRange = undefined;
    }

    exploredCharCount = calculator.calcExploredCharCount(customReadingPointRange);

    if (isUser) {
      previousIntendedCount = exploredCharCount;

      if ($selectionToBookmarkEnabled$) {
        clearRange(window);
      }
    }

    bookmarkData.then((data) => {
      useExploredCharCount = isUser || !!customReadingPointRange;
      updateBookmarkScreen(data);
    });

    if (isUser) {
      scheduleAutoBookmark();
    }
  }

  $effect(() => {
    if (!autoBookmark) {
      clearAutoBookmarkTimer();
    }
  });

  onDestroy(() => {
    clearAutoBookmarkTimer();
    sectionReadyWaiters = [];
  });

  onMount(() => {
    let lastWheelFlip = 0;
    const handleWheel = (ev: WheelEvent) => {
      if ($disableWheelNavigation$ || appShortcuts.disabled) return;

      const now = performance.now();
      if (now - lastWheelFlip < 50) return;
      lastWheelFlip = now;

      let multiplier = (ev.deltaX < 0 ? -1 : 1) * (verticalMode ? -1 : 1);
      if (!ev.deltaX) {
        multiplier = ev.deltaY < 0 ? -1 : 1;
      }
      pageManager?.flipPage(multiplier as -1 | 1);
    };

    document.body.addEventListener('wheel', handleWheel, { passive: true });

    return () => document.body.removeEventListener('wheel', handleWheel);
  });

  function scheduleAutoBookmark() {
    clearAutoBookmarkTimer();

    if (!autoBookmark) return;

    autoBookmarkTimer = window.setTimeout(() => {
      autoBookmarkTimer = undefined;
      onbookmark?.();
    }, autoBookmarkTime * 1000);
  }

  function clearAutoBookmarkTimer() {
    window.clearTimeout(autoBookmarkTimer);
    autoBookmarkTimer = undefined;
  }

  function resetSectionIndex(index: number) {
    sectionReadyIndex = -1;
    readerState.sectionIndex = index;
  }

  async function setSectionIndexAndWait(index: number): Promise<SectionCharacterStatsCalculator> {
    if (readerState.sectionIndex === index && sectionReadyIndex === index && calculator) {
      return calculator;
    }

    const ready = waitForNextSectionReady(index);
    if (readerState.sectionIndex !== index) {
      resetSectionIndex(index);
    }
    return ready;
  }

  function waitForNextSectionReady(index: number) {
    return new Promise<SectionCharacterStatsCalculator>((resolve) => {
      sectionReadyWaiters.push({ index, resolve });
    });
  }

  function notifySectionReady(updatedCalculator: SectionCharacterStatsCalculator) {
    sectionReadyIndex = readerState.sectionIndex;

    const readyWaiters = sectionReadyWaiters.filter(
      (waiter) => waiter.index === readerState.sectionIndex
    );
    sectionReadyWaiters = [];

    for (const waiter of readyWaiters) {
      waiter.resolve(updatedCalculator);
    }
  }

  function updateSectionData(updatedCustomReadingRange: Range | undefined) {
    if (!pageManager || !calculator) {
      return;
    }

    pageManager.updateSectionDataByOffset(
      calculator.getOffsetToRange(updatedCustomReadingRange, columnCount)
    );
  }

  function initContent(el: HTMLElement) {
    calculator = new SectionCharacterStatsCalculator(
      el,
      sections,
      readerState,
      () => width,
      () => height,
      () => gap,
      verticalMode,
      el,
      document
    );
    exploredCharCount = 0;
    previousIntendedCount = 0;
    onbookcharcountchange?.(calculator.charCount);

    let fontLoaded: boolean;

    try {
      fontLoaded = document.fonts.check(`${fontSize}px ${fontFamilyGroupOne || 'Noto Serif JP'}`);
    } catch (error: any) {
      logger.error(`Error checking Font Load: ${error.message}`);
      fontLoaded = true;
    }

    if (fontLoaded || fontLoadingAdded) {
      triggerContentChange();
    } else if (!fontLoadingAdded) {
      fontLoadingAdded = true;

      const timeout = isStoredFont(fontFamilyGroupOne, $userFonts$) ? 30000 : 10000;
      const fontLoadTimer = setTimeout(() => {
        logger.error(`Error loading primary Font: ${fontFamilyGroupOne}`);
        triggerContentChange();
      }, timeout);

      document.fonts.addEventListener('loadingdone', () => {
        clearTimeout(fontLoadTimer);
        triggerContentChange();
      });
    }
  }

  function triggerContentChange() {
    if (!calculator || !scrollEl) return;

    calculator.updateCurrentSection(readerState.sectionIndex);
    oncontentchange?.(scrollEl);
  }

  function onContentDisplayChange(_calculator: SectionCharacterStatsCalculator) {
    _calculator.updateParagraphPos();
    exploredCharCount = _calculator.calcExploredCharCount(customReadingPointRange);
    const section = sections[readerState.sectionIndex];
    currentSectionId = section?.id.startsWith('miwake-') ? section.id : '';
    notifySectionReady(_calculator);

    if (scrollWhenReady) {
      scrollWhenReady = false;
      bookmarkData.then((data) => {
        if (!data || !bookmarkManager) return;
        exploredCharCount = data.exploredCharCount || 0;
        bookmarkManager.scrollToBookmark(data);
      });
    } else {
      bookmarkData.then(updateBookmarkScreen);
    }
    allowDisplay = true;
  }

  function updateBookmarkScreen(data: BooksDbBookmarkData | undefined) {
    const bookmarkCharCount = data?.exploredCharCount;
    if (!calculator || !bookmarkCharCount) return;

    const result = calculator.checkBookmarkOnScreen(bookmarkCharCount);

    if (scrollEl && result.isBookmarkScreen) {
      const dimentionAdjustment = Number(
        getComputedStyle(scrollEl)[verticalMode ? 'marginTop' : 'marginRight'].replace(/px$/, '')
      );

      if (!result.bookmarkPos) {
        setDefaultBookmarkPositions(dimentionAdjustment);
      } else if (verticalMode) {
        bookmarkTopAdjustment = dimentionAdjustment ? `${dimentionAdjustment}px` : '0.5rem';
        bookmarkLeftAdjustment = `${result.bookmarkPos.left}px`;
        bookmarkRightAdjustment = undefined;
      } else {
        bookmarkTopAdjustment = `${result.bookmarkPos.top}px`;
        bookmarkRightAdjustment = undefined;
        bookmarkLeftAdjustment =
          result.bookmarkPos.left > 0
            ? `calc(${result.bookmarkPos.left}px - ${deviceEnvironment.isMobile ? '15' : '20'}px)`
            : `calc(${Math.max(deviceEnvironment.isMobile ? 15 : 20, dimentionAdjustment)}px)`;
      }
    } else {
      setDefaultBookmarkPositions(0);
    }

    if (result.isBookmarkScreen && data.exploredCharCount) {
      if (result.node && !useExploredCharCount && !result.isFirstNode) {
        updateSectionData(createRange(result.node));
      } else if (result.isFirstNode) {
        updateSectionData(undefined);
      }

      exploredCharCount = useExploredCharCount ? exploredCharCount : data.exploredCharCount;
      previousIntendedCount = exploredCharCount;
    }

    useExploredCharCount = true;
    isBookmarkScreen = result.isBookmarkScreen;
    onisbookmarkscreenchange?.(result.isBookmarkScreen);
  }

  function setDefaultBookmarkPositions(dimensionAdjustment: number) {
    if (verticalMode) {
      bookmarkTopAdjustment = dimensionAdjustment ? `${dimensionAdjustment}px` : '0.5rem';
      bookmarkLeftAdjustment = $firstDimensionMargin$
        ? `${width - $firstDimensionMargin$}px`
        : undefined;
      bookmarkRightAdjustment = $firstDimensionMargin$ ? undefined : '0.75rem';
    } else {
      bookmarkTopAdjustment = $firstDimensionMargin$ ? `${$firstDimensionMargin$}px` : '0.5rem';
      bookmarkLeftAdjustment = dimensionAdjustment
        ? `calc(${dimensionAdjustment}px + 0.75rem)`
        : '0.75rem';
      bookmarkRightAdjustment = undefined;
    }
  }

  function onSwipe(ev: SwipeCustomEvent) {
    if (!pageManager || appShortcuts.disabled) return;
    if (ev.detail.direction !== 'left' && ev.detail.direction !== 'right') return;
    const swipeLeft = ev.detail.direction === 'left';
    const nextPage = verticalMode ? !swipeLeft : swipeLeft;
    pageManager.flipPage(nextPage ? 1 : -1);
  }

  function goToChapter(chapterId: string) {
    const nextSectionIndex = sections.findIndex(
      (section) => section.id === chapterId || section.querySelector(`[id="${chapterId}"]`)
    );

    if (nextSectionIndex > -1) {
      void setSectionIndexAndWait(nextSectionIndex).then(() => {
        pageManager?.scrollTo(0, true);
      });
    }
  }
</script>

<div
  bind:this={scrollEl}
  style:color={fontColor}
  style:font-size="{fontSize}px"
  style:line-height={lineHeight}
  style:padding-top={!verticalMode && firstDimensionMargin
    ? `${firstDimensionMargin}px`
    : undefined}
  style:padding-bottom={!verticalMode && firstDimensionMargin
    ? `${firstDimensionMargin}px`
    : undefined}
  style:padding-left={verticalMode && firstDimensionMargin
    ? `${firstDimensionMargin}px`
    : undefined}
  style:padding-right={verticalMode ? `${firstDimensionMargin + furiganaExtra}px` : undefined}
  style:max-width={width ? `${width + furiganaExtra}px` : undefined}
  style:max-height={verticalMode && height ? `${height}px` : undefined}
  style:--font-family-serif={fontFamilyGroupOne}
  style:--font-family-sans-serif={fontFamilyGroupTwo}
  style:--book-content-hint-furigana-font-color={hintFuriganaFontColor}
  style:--book-content-hint-furigana-shadow-color={hintFuriganaShadowColor}
  style:--book-content-child-width="{width + furiganaExtra}px"
  style:margin-right={furiganaExtra ? `-${furiganaExtra}px` : undefined}
  style:--book-content-child-height="{height}px"
  style:--book-content-child-column-width={!verticalMode && columnCount === 1 ? `${width}px` : ''}
  style:--book-content-column-count={columnCount}
  style:--book-content-image-max-width="{verticalMode
    ? width
    : (width + gap) / columnCount - gap}px"
  style:--book-content-text-margin="{textMarginValue ?? 0}rem"
  style:--book-content-text-intendation="{textIndentation ?? 0}rem"
  style:font-feature-settings={fontFeatureSettings}
  style:text-orientation={verticalTextOrientation}
  class:book-content--avoid-page-break={avoidPageBreak}
  class:book-content--writing-vertical-rl={verticalMode}
  class:book-content--writing-horizontal-rl={!verticalMode}
  class:book-content--hide-spoiler-image={hideSpoilerImage}
  class:book-content--furigana-style-hide={furiganaStyle === FuriganaStyle.Hide}
  class:book-content--furigana-style-dim={furiganaStyle === FuriganaStyle.Dim}
  class:book-content--furigana-style-toggle={furiganaStyle === FuriganaStyle.Toggle}
  class:ttu-apply-important={prioritizeReaderStyles}
  class:ttu-apply-justification={enableTextJustification}
  class:ttu-margin-manual={textMarginMode === 'manual'}
  class:ttu-text-wrap-pretty={enableTextWrapPretty}
  class="book-content m-auto"
  {...useSwipe(onSwipe, () => ({
    timeframe: 500,
    minSwipeDistance: $swipeThreshold$,
    touchAction: 'pan-y'
  }))}
>
  <div class="book-content-container" id={currentSectionId || null} bind:this={contentEl} lang="ja">
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    {@html displayedHtml}
  </div>
</div>

{#if !allowDisplay}
  <div
    class="fixed inset-0 flex size-full items-center justify-center text-7xl"
    style:color={fontColor}
    style:background-color={backgroundColor}
  >
    <Fa icon={faSpinner} spin />
  </div>
{/if}

{#if isBookmarkScreen}
  <div
    class="fixed size-3 text-base opacity-25 sm:text-xl"
    style:color={fontColor}
    style:top={bookmarkTopAdjustment}
    style:left={bookmarkLeftAdjustment}
    style:right={bookmarkRightAdjustment}
  >
    <Fa icon={faBookmark} />
  </div>
{/if}

<svelte:window onresize={handleResize} />

<style>
  @import '../styles.css';

  .book-content {
    overflow: hidden;
    width: var(--book-content-child-width, 95vh);
  }

  .book-content-container {
    column-count: var(--book-content-column-count, 1);
    column-width: var(
      --book-content-child-column-width,
      auto
    ); /* required for WebKit + column-count 1 */
    column-gap: 40px;
    column-fill: auto;
    height: var(--book-content-child-height, 95vh);

    :global(.ttu-illustration-container) {
      max-width: var(--book-content-image-max-width, 95vh) !important;
      max-height: var(--book-content-child-height, 95vh) !important;
    }
  }

  .book-content {
    :global(svg),
    :global(img) {
      max-width: var(--book-content-image-max-width, 100vw);
      max-height: var(--book-content-child-height, 100vh);
      object-fit: contain;
    }

    &.book-content--avoid-page-break {
      :global(p) {
        break-inside: avoid;
      }
    }

    :global(.ttu-img-container) {
      /* Needed for Blink rendering engine */
      break-inside: avoid;
    }
  }

  .book-content--writing-vertical-rl {
    .book-content-container {
      column-width: var(--book-content-child-height, 100vh);
      width: 100%;
      height: auto;
    }

    :global(.book-content-container > *:not(.ttu-book-html-wrapper) > *:has(ruby):has(rt)),
    :global(
      .book-content-container
        > div.ttu-book-html-wrapper
        > div.ttu-book-body-wrapper
        > *
        > *:has(ruby):has(rt)
    ) {
      padding-right: 10px !important;
    }
  }

  .book-content--writing-horizontal-rl {
    :global(.book-content-container > *:not(.ttu-book-html-wrapper) > *:has(ruby):has(rt)),
    :global(
      .book-content-container
        > div.ttu-book-html-wrapper
        > div.ttu-book-body-wrapper
        > *
        > *:has(ruby):has(rt)
    ) {
      padding-top: 10px !important;
    }
  }
</style>
