<script lang="ts">
  import { browser } from '$app/environment';
  import { bookTOCState } from '$lib/components/book-reader/book-toc/book-toc-state.svelte';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { SECTION_CHANGE } from '$lib/data/events';
  import { isStoredFont } from '$lib/data/fonts';
  import { FuriganaStyle } from '$lib/data/furigana-style';
  import { logger } from '$lib/data/logger';
  import type { TextMarginMode } from '$lib/data/text-margin-mode';
  import {
    disableWheelNavigation$,
    firstDimensionMargin$,
    selectionToBookmarkEnabled$,
    skipKeyDownListener$,
    swipeThreshold$,
    userFonts$
  } from '$lib/data/store';
  import { clearRange, createRange, pulseElement } from '$lib/functions/range-util';
  import { iffBrowser } from '$lib/functions/rxjs/iff-browser';
  import { getExternalTargetElement, isMobile$ } from '$lib/functions/utils';
  import { faBookmark, faSpinner } from '@fortawesome/free-solid-svg-icons';
  import {
    BehaviorSubject,
    combineLatest,
    debounceTime,
    distinctUntilChanged,
    filter,
    fromEvent,
    map,
    skip,
    Subject,
    switchMap,
    take,
    takeUntil,
    throttleTime
  } from 'rxjs';
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
    ontrackerPause?: () => void;
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
    oncontentchange,
    ontrackerPause
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

  let isBookmarkScreen = $state(false);

  let bookmarkTopAdjustment = $state<string>();

  let bookmarkLeftAdjustment = $state<string>();

  let bookmarkRightAdjustment = $state<string>();

  let fontLoadingAdded = false;

  let currentSectionId = $state('');

  const width$ = new Subject<number>();

  const height$ = new Subject<number>();

  const sectionIndex$ = new BehaviorSubject<number>(-1);

  const pageChange$ = new Subject<boolean>();

  const virtualScrollPos$ = new BehaviorSubject(0);

  const sectionRenderComplete$ = new Subject<number>();

  const sectionReady$ = new Subject<SectionCharacterStatsCalculator>();

  const currentSection$ = sectionIndex$.pipe(map((index) => sections[index]?.innerHTML || ''));

  const cssClassOverflowHidden = 'overflow-hidden';

  const gap = 40;

  const destroy$ = new Subject<void>();

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

  // Push width/height changes to RxJS subjects
  $effect(() => {
    if (width) width$.next(width);
  });

  $effect(() => {
    if (height) height$.next(height);
  });

  // When htmlContent changes, set scrollWhenReady
  $effect(() => {
    if (htmlContent) {
      scrollWhenReady = true;
    }
  });

  // Initialize content when displayedHtml changes (section navigation).
  // Skip only the initial empty state (before any section loads); after that,
  // process all sections including empty ones (blank spine items / separators).
  let contentInitialized = false;
  $effect(() => {
    const html = displayedHtml;
    const el = scrollEl;
    if ((!contentInitialized && !html) || !el) return;
    contentInitialized = true;
    untrack(() => initContent(el));
  });

  // When htmlContent changes, parse sections and reset sectionIndex
  $effect(() => {
    if (browser && htmlContent) {
      const tempContainer = document.createElement('div');
      tempContainer.innerHTML = htmlContent;
      sections = Array.from(tempContainer.children);
      // untrack because sectionIndex$.next() synchronously triggers currentSection$
      // subscribers that write to $state (allowDisplay)
      untrack(() => sectionIndex$.next(0));
    }
  });

  // Create/recreate PageManager and BookmarkManager when dependencies change
  $effect(() => {
    if (!contentEl || !scrollEl || !sections.length || !calculator) {
      return undefined;
    }

    const content = contentEl;
    const scroll = scrollEl;
    const sectionCalculator = calculator;
    const tocSections = bookTOCState.sections;
    const w = width;
    const h = height;
    const vm = verticalMode;

    pageManager = new PageManagerPaginated(
      content,
      scroll,
      sections,
      tocSections,
      (sectionProgress) => bookTOCState.setSectionProgress(sectionProgress),
      sectionIndex$,
      virtualScrollPos$,
      w,
      h,
      gap,
      vm,
      pageChange$,
      sectionRenderComplete$
    );
    readerController.setPageManager(pageManager);

    bookmarkManager = new BookmarkManagerPaginated(
      sectionCalculator,
      pageManager,
      sectionReady$,
      sectionIndex$,
      (c) => (previousIntendedCount = c)
    );
    readerController.setBookmarkManager(bookmarkManager);

    return () => {
      readerController.clearPageManager();
      readerController.clearBookmarkManager();
    };
  });

  // On content display change
  $effect(() => {
    if (calculator && width && height && !loadingState) {
      const c = calculator;
      requestAnimationFrame(() => {
        onContentDisplayChange(c);
      });
    }
  });

  // Fire sectionRenderComplete when calculator is ready and not loading
  $effect(() => {
    if (calculator && !loadingState) {
      const sectionIndex = sectionIndex$.getValue();
      const section = sections[sectionIndex];

      currentSectionId = section?.id.startsWith('miwake-') ? section.id : '';

      sectionRenderComplete$.next(sectionIndex);
    }
  });

  // Add overflow-hidden class to body
  $effect(() => {
    if (browser) {
      // because Yomitan popup creates overflow on vertical-rl
      document.body.classList.add(cssClassOverflowHidden);
    }
  });

  // React to customReadingPointRange changes
  $effect(() => {
    updateAfterCustomReadingPointUpdate(customReadingPointRange);
  });

  /** Experimental Code - May be removed any time without warning */
  onMount(() => document.addEventListener('miwake-action', handleAction, false));

  onMount(() => bookTOCState.onChapterNavigation(goToChapter));

  async function handleAction({ detail }: any) {
    if (!detail.type || !calculator || !pageManager) {
      return;
    }

    if (detail.type === 'cue') {
      const targetSection = getTargetSection(detail.selector);

      if (targetSection === -1) {
        return;
      }

      const currentSection = sectionIndex$.getValue();

      if (currentSection !== targetSection) {
        const waitForSection = new Promise<void>((resolve) => {
          sectionReady$.pipe(take(1)).subscribe(() => resolve());
        });

        sectionIndex$.next(targetSection);
        pageManager.scrollTo(0, false);

        await waitForSection;
      }

      const scrollPos = getTargetScrollPos(calculator, detail.selector);

      if (scrollPos < 0) {
        return;
      }

      pageManager.scrollTo(scrollPos, true);

      if (currentSection !== targetSection) {
        document.dispatchEvent(new CustomEvent(SECTION_CHANGE));
      }
    } else if (detail.type === 'pauseTracker') {
      const targetSection = getTargetSection(detail.selector);

      if (targetSection === -1) {
        return;
      }

      if (targetSection !== sectionIndex$.getValue()) {
        ontrackerPause?.();
        return;
      }

      const scrollPos = getTargetScrollPos(calculator, detail.selector);

      if (scrollPos < 0) {
        return;
      }

      const currentScrollPos = calculator.getScrollPosByCharCount(
        calculator.calcExploredCharCount(customReadingPointRange)
      );

      if (scrollPos !== currentScrollPos) {
        ontrackerPause?.();
      }
    }
  }

  function getTargetSection(selector: string) {
    let targetSection = -1;

    for (let index = 0, { length } = sections; index < length; index += 1) {
      const element = getExternalTargetElement(sections[index], selector);

      if (element) {
        targetSection = index;
        break;
      }
    }

    return targetSection;
  }

  function getTargetScrollPos(
    calculatorInstance: SectionCharacterStatsCalculator,
    selector: string
  ) {
    const targetElement = getExternalTargetElement(document, selector);
    const nodeRange = document.createRange();

    if (!targetElement) {
      return -1;
    }

    nodeRange.setStart(targetElement, 0);
    nodeRange.setEnd(targetElement, targetElement.childNodes.length);

    return calculatorInstance.getScrollPosByCharCount(
      calculatorInstance.calcExploredCharCount(nodeRange)
    );
  }
  /** Experimental Code - May be removed or changed any time without warning */

  onDestroy(() => {
    document.removeEventListener('miwake-action', handleAction, false);

    document.body.classList.remove(cssClassOverflowHidden);

    destroy$.next();
    destroy$.complete();
  });

  combineLatest([width$, height$])
    .pipe(
      skip(1),
      switchMap(() => sectionReady$.pipe(take(1))),
      takeUntil(destroy$)
    )
    .subscribe(() => {
      if (!calculator || !pageManager) return;

      pageManager.scrollTo(0, false);
      calculator.updateParagraphPos();

      const scrollPos = calculator.getScrollPosByCharCount(previousIntendedCount);

      if (scrollPos < 0) return;

      pageManager.scrollTo(scrollPos, false);
      isResizing = false;
    });

  pageChange$.pipe(takeUntil(destroy$)).subscribe((isUser) => {
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
  });

  if (untrack(() => autoBookmark)) {
    const bookmarkTime = untrack(() => autoBookmarkTime);
    pageChange$.pipe(debounceTime(bookmarkTime * 1000), takeUntil(destroy$)).subscribe((isUser) => {
      if (isUser) {
        onbookmark?.();
      }
    });
  }

  currentSection$.pipe(distinctUntilChanged(), takeUntil(destroy$)).subscribe(() => {
    allowDisplay = false;
  });

  currentSection$.pipe(takeUntil(destroy$)).subscribe((html) => {
    const nestAnimationFrame = (fn: () => void, count: number) => {
      if (count === 0) {
        fn();
        return;
      }
      requestAnimationFrame(() => nestAnimationFrame(fn, count - 1));
    };

    // 2x for loading screen to render
    nestAnimationFrame(() => {
      displayedHtml = html;
    }, 2);
  });

  iffBrowser(() => fromEvent<WheelEvent>(document.body, 'wheel', { passive: true }))
    .pipe(
      filter(() => !$disableWheelNavigation$ && !$skipKeyDownListener$),
      throttleTime(50),
      takeUntil(destroy$)
    )
    .subscribe((ev) => {
      let multiplier = (ev.deltaX < 0 ? -1 : 1) * (verticalMode ? -1 : 1);
      if (!ev.deltaX) {
        multiplier = ev.deltaY < 0 ? -1 : 1;
      }
      pageManager?.flipPage(multiplier as -1 | 1);
    });

  function updateAfterCustomReadingPointUpdate(updatedCustomReadingPosition: Range | undefined) {
    if (!calculator) {
      return;
    }

    exploredCharCount = calculator.calcExploredCharCount(updatedCustomReadingPosition);
    previousIntendedCount = exploredCharCount;

    updateSectionData(updatedCustomReadingPosition);
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
      virtualScrollPos$,
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

    calculator.updateCurrentSection(sectionIndex$.getValue());
    oncontentchange?.(scrollEl);
  }

  function onContentDisplayChange(_calculator: SectionCharacterStatsCalculator) {
    _calculator.updateParagraphPos();
    exploredCharCount = _calculator.calcExploredCharCount(customReadingPointRange);
    sectionReady$.next(_calculator);

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
            ? `calc(${result.bookmarkPos.left}px - ${$isMobile$ ? '15' : '20'}px)`
            : `calc(${Math.max($isMobile$ ? 15 : 20, dimentionAdjustment)}px)`;
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
    if (!pageManager || $skipKeyDownListener$) return;
    if (ev.detail.direction !== 'left' && ev.detail.direction !== 'right') return;
    const swipeLeft = ev.detail.direction === 'left';
    const nextPage = verticalMode ? !swipeLeft : swipeLeft;
    pageManager.flipPage(nextPage ? 1 : -1);
  }

  function onKeydown(ev: KeyboardEvent) {
    if (
      !pageManager ||
      $skipKeyDownListener$ ||
      ev.altKey ||
      ev.ctrlKey ||
      ev.shiftKey ||
      ev.metaKey ||
      ev.repeat
    )
      return;
    switch (ev.code) {
      case 'ArrowLeft':
      case 'KeyA':
        pageManager[verticalMode ? 'nextPage' : 'prevPage']();
        break;
      case 'ArrowRight':
      case 'KeyD':
        pageManager[verticalMode ? 'prevPage' : 'nextPage']();
        break;
      case 'ArrowUp':
        pageManager.prevPage();
        break;
      case 'ArrowDown':
        pageManager.nextPage();
        break;
      default:
    }
  }

  function goToChapter(chapterId: string) {
    const nextSectionIndex = sections.findIndex(
      (section) => section.id === chapterId || section.querySelector(`[id="${chapterId}"]`)
    );

    if (nextSectionIndex > -1) {
      sectionIndex$.next(nextSectionIndex);
      pageManager?.scrollTo(0, true);
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

<svelte:window onkeydown={onKeydown} onresize={() => (isResizing = true)} />

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
