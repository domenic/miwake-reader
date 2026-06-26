<script lang="ts">
  import { browser } from '$app/environment';
  import {
    bookTOCState,
    type SectionWithProgress
  } from '$lib/components/book-reader/book-toc/book-toc-state.svelte';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { isStoredFont } from '$lib/data/fonts';
  import { FuriganaStyle } from '$lib/data/furigana-style';
  import { logger } from '$lib/data/logger';
  import { appShortcuts } from '$lib/data/app-shortcuts.svelte';
  import type { TextMarginMode } from '$lib/data/text-margin-mode';
  import { customReadingPointEnabled$, disableWheelNavigation$, userFonts$ } from '$lib/data/store';
  import { getReferencePoints } from '$lib/functions/range-util';
  import { faBookmark, faSpinner } from '@fortawesome/free-solid-svg-icons';
  import { onDestroy, onMount, untrack } from 'svelte';
  import { MediaQuery, SvelteMap } from 'svelte/reactivity';
  import { innerWidth } from 'svelte/reactivity/window';
  import Fa from 'svelte-fa';
  import type { BookReaderController } from '../book-reader-controller.svelte';
  import { AutoScrollerContinuous } from './auto-scroller-continuous.svelte';
  import { BookmarkManagerContinuous, type BookmarkPosData } from './bookmark-manager-continuous';
  import { CharacterStatsCalculator } from './character-stats-calculator';
  import { horizontalMouseWheel } from './horizontal-mouse-wheel';
  import { PageManagerContinuous } from './page-manager-continuous';

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
    secondDimensionMaxValue: number;
    firstDimensionMargin: number;
    autoPositionOnResize: boolean;
    autoBookmark: boolean;
    autoBookmarkTime: number;
    loadingState: boolean;
    multiplier: number;
    bookmarkData: Promise<BooksDbBookmarkData | undefined>;
    customReadingPoint: number;
    exploredCharCount: number;
    customReadingPointLeft: number;
    customReadingPointTop: number;
    customReadingPointScrollOffset: number;
    readerController: BookReaderController;
    onbookcharcountchange?: (count: number) => void;
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
    secondDimensionMaxValue,
    firstDimensionMargin,
    autoPositionOnResize,
    autoBookmark,
    autoBookmarkTime,
    loadingState,
    multiplier,
    bookmarkData,
    customReadingPoint,
    exploredCharCount = $bindable(),
    customReadingPointLeft = $bindable(),
    customReadingPointTop = $bindable(),
    customReadingPointScrollOffset = $bindable(),
    readerController,
    onbookcharcountchange,
    onbookmark,
    oncontentchange
  }: Props = $props();

  let allowDisplay = $state(false);

  let contentEl = $state<HTMLElement>();

  let calculator = $state<CharacterStatsCalculator>();

  let contentReadyEvent = $state({});

  let bookmarkManager: BookmarkManagerContinuous | undefined;

  let pageManager: PageManagerContinuous | undefined;

  let bookmarkPos = $state<BookmarkPosData>();

  let scrollWhenReady: boolean;

  let prevIntendedCharCount = 0;

  let isResizeScroll = false;

  let fontLoadingAdded = false;

  const scrollFn = browser
    ? horizontalMouseWheel(4, document.documentElement, requestAnimationFrame)
    : () => 0;

  const sectionToElement = new SvelteMap<string, HTMLElement>();

  const sectionData = new SvelteMap<string, SectionWithProgress>();

  let scrollAdjustment = 0;

  let willNavigate = false;

  let stopAutoBookmark: (() => void) | undefined;

  let stopSectionProgressTracking: (() => void) | undefined;

  let lastAutoPositionDimension: number | undefined;

  let autoPositionTimer: number | undefined;

  let autoPositionFrame: number | undefined;
  const compactViewport = new MediaQuery('max-width: 639.98px');

  let fullLengthDimension = $derived(verticalMode ? 'height' : 'width');

  let modifyingDimension = $derived(verticalMode ? 'width' : 'height');

  let boundSide = $derived(
    verticalMode ? (['left', 'right'] as const) : (['top', 'bottom'] as const)
  );

  let maxHeight = $derived(
    verticalMode && secondDimensionMaxValue ? secondDimensionMaxValue : undefined
  );

  let bookmarkAdjustment = $derived.by(() => {
    const base = compactViewport.current ? '0.25rem' : '0.5rem';

    if (secondDimensionMaxValue && contentEl) {
      const dimensionAdjustment = Number(
        getComputedStyle(contentEl)[verticalMode ? 'marginTop' : 'marginRight'].replace(/px$/, '')
      );

      return `min(max(calc(${`${dimensionAdjustment}px - ${base}`}), ${base}), ${
        dimensionAdjustment ? `${dimensionAdjustment}px` : base
      })`;
    }

    return base;
  });

  // Initialize content when htmlContent changes (or on first mount).
  // Same pattern as paginated's displayedHtml watcher.
  $effect(() => {
    if (!contentEl || !htmlContent) return;
    const el = contentEl;
    scrollWhenReady = true;
    untrack(() => initContent(el));
  });

  // When calculator, width, height, or loadingState change, trigger content display change
  $effect(() => {
    if (calculator && width && height && !loadingState) {
      const c = calculator;
      requestAnimationFrame(() => {
        onContentDisplayChange(c);
      });
    }
  });

  // Create bookmarkManager when calculator is available
  $effect(() => {
    if (!browser || !calculator) {
      return undefined;
    }

    bookmarkManager = new BookmarkManagerContinuous(calculator, window, firstDimensionMargin || 0);

    return readerController.registerBookmarkManager(bookmarkManager);
  });

  // Update bookmark position when contentReadyEvent changes
  $effect(() => {
    if (contentReadyEvent) {
      bookmarkPos = undefined;
      bookmarkData.then((data) => {
        if (!data) return;
        bookmarkPos = bookmarkManager?.getBookmarkBarPosition(data);
      });
    }
  });

  // Create pageManager when verticalMode or firstDimensionMargin change
  $effect(() => {
    if (!browser) {
      return undefined;
    }

    pageManager = new PageManagerContinuous(verticalMode, firstDimensionMargin, window);

    return readerController.registerPageManager(pageManager);
  });

  // Update custom reading point position
  $effect(() => {
    if ($customReadingPointEnabled$ && contentEl && Number.isFinite(customReadingPoint)) {
      updateCustomReadingPointPosition();
      onScroll();
      updateSectionProgress();
    }
  });

  onMount(() => {
    const autoScroller = new AutoScrollerContinuous(
      () => multiplier,
      () => verticalMode,
      document
    );
    return readerController.registerAutoScroller(autoScroller);
  });

  onMount(() => readerController.registerChapterNavigator(scrollToChapter));

  $effect(() => {
    const dimension = verticalMode ? height : width;

    if (!autoPositionOnResize) {
      lastAutoPositionDimension = dimension;
      clearScheduledAutoPosition();
      return;
    }

    if (lastAutoPositionDimension === undefined) {
      lastAutoPositionDimension = dimension;
      return;
    }

    if (dimension === lastAutoPositionDimension) {
      return;
    }

    lastAutoPositionDimension = dimension;
    scheduleAutoPositionAfterResize();
  });

  onMount(() => {
    // Register wheel handler with { passive: false } since Svelte 5 doesn't support |nonpassive
    document.body.addEventListener('wheel', onWheel, { passive: false });

    // Register mousedown handler on body
    document.body.addEventListener('mousedown', onBodyMousedown);

    return () => {
      document.body.removeEventListener('wheel', onWheel);
      document.body.removeEventListener('mousedown', onBodyMousedown);
    };
  });

  onDestroy(() => {
    stopAutoBookmark?.();
    stopSectionProgressTracking?.();
    clearScheduledAutoPosition();
  });

  function scheduleAutoPositionAfterResize() {
    clearScheduledAutoPosition();

    autoPositionTimer = window.setTimeout(() => {
      autoPositionTimer = undefined;
      autoPositionFrame = requestAnimationFrame(() => {
        autoPositionFrame = undefined;
        autoPositionAfterResize();
      });
    }, 10);
  }

  function clearScheduledAutoPosition() {
    window.clearTimeout(autoPositionTimer);
    if (autoPositionFrame !== undefined) {
      cancelAnimationFrame(autoPositionFrame);
      autoPositionFrame = undefined;
    }
    autoPositionTimer = undefined;
  }

  function autoPositionAfterResize() {
    if (!calculator || !pageManager) return;

    const scrollPos =
      calculator.getScrollPosByCharCount(prevIntendedCharCount) +
      (verticalMode ? customReadingPointScrollOffset : -customReadingPointScrollOffset);
    isResizeScroll = true;
    pageManager.scrollTo(scrollPos);
  }

  function updateCustomReadingPointPosition() {
    if (!$customReadingPointEnabled$ || !contentEl) {
      return;
    }

    const {
      elLeftReferencePoint,
      elTopReferencePoint,
      elRightReferencePoint,
      elBottomReferencePoint,
      firstDimensionMargin: firstDimensionMarginValue,
      pointGap
    } = getReferencePoints(window, contentEl, verticalMode, firstDimensionMargin);

    if (verticalMode) {
      customReadingPointTop = elTopReferencePoint;
      customReadingPointLeft = Math.min(
        Math.max(
          firstDimensionMarginValue +
            (elRightReferencePoint - elLeftReferencePoint) * (customReadingPoint / 100) -
            2,
          elLeftReferencePoint + pointGap
        ),
        elRightReferencePoint - 2
      );
      customReadingPointScrollOffset =
        innerWidth.current! - firstDimensionMarginValue - customReadingPointLeft;

      return;
    }

    customReadingPointTop = Math.min(
      Math.max(
        firstDimensionMarginValue +
          (elBottomReferencePoint - elTopReferencePoint) * (customReadingPoint / 100),
        firstDimensionMarginValue
      ),
      elBottomReferencePoint - pointGap * 1.5
    );
    customReadingPointLeft = elLeftReferencePoint;
    customReadingPointScrollOffset = customReadingPointTop - firstDimensionMarginValue;
  }

  function onContentDisplayChange(_calculator: CharacterStatsCalculator) {
    _calculator.updateParagraphPos();
    updateCustomReadingPointPosition();
    exploredCharCount = _calculator.calcExploredCharCount(customReadingPointScrollOffset);

    if (scrollWhenReady) {
      scrollWhenReady = false;

      bookmarkData
        .then((data) => {
          if (!data || !bookmarkManager) {
            return;
          }

          prevIntendedCharCount = data.exploredCharCount || 0;
          bookmarkManager.scrollToBookmark(data, customReadingPointScrollOffset);
        })
        .finally(() => {
          if (autoBookmark) {
            stopAutoBookmark?.();
            stopAutoBookmark = startAutoBookmarking(autoBookmarkTime * 1000);
          }

          startSectionProgressTracking();
        });
    }
    contentReadyEvent = {};
    allowDisplay = true;
  }

  function startAutoBookmarking(delay: number) {
    const abortController = new AbortController();
    let hasSkippedInitialScroll = false;
    let bookmarkTimer: number | undefined;

    const scheduleBookmark = () => {
      if (!hasSkippedInitialScroll) {
        hasSkippedInitialScroll = true;
        return;
      }

      window.clearTimeout(bookmarkTimer);
      bookmarkTimer = window.setTimeout(() => {
        bookmarkTimer = undefined;
        onbookmark?.();
      }, delay);
    };

    window.addEventListener('scroll', scheduleBookmark, { signal: abortController.signal });

    return () => {
      window.clearTimeout(bookmarkTimer);
      abortController.abort();
    };
  }

  function startSectionProgressTracking() {
    stopSectionProgressTracking?.();
    stopSectionProgressTracking = undefined;
    sectionData.clear();
    sectionToElement.clear();

    for (const section of bookTOCState.sections) {
      const ref = section.reference;
      const elm = document.getElementById(ref);

      if (!elm) {
        continue;
      }

      if (!scrollAdjustment) {
        scrollAdjustment =
          Number(
            getComputedStyle(elm)[verticalMode ? 'marginLeft' : 'marginBottom'].replace(/px$/, '')
          ) / 2;
      }

      sectionData.set(ref, { ...section, progress: 0 });
      sectionToElement.set(ref, elm);
    }

    if (!sectionToElement.size) {
      bookTOCState.clearSectionProgress();
      return;
    }

    updateSectionProgress();

    let updateTimer: number | undefined;
    const scheduleSectionProgressUpdate = () => {
      if (updateTimer !== undefined) {
        window.clearTimeout(updateTimer);
      }

      updateTimer = window.setTimeout(
        () => {
          updateTimer = undefined;
          updateSectionProgress();
        },
        willNavigate ? 100 : 500
      );
    };

    window.addEventListener('scroll', scheduleSectionProgressUpdate);
    stopSectionProgressTracking = () => {
      if (updateTimer !== undefined) {
        window.clearTimeout(updateTimer);
      }

      window.removeEventListener('scroll', scheduleSectionProgressUpdate);
    };
  }

  function updateSectionProgress() {
    const entries = [...sectionData.entries()];

    for (let index = 0, { length } = entries; index < length; index += 1) {
      const [ref, entry] = entries[index];

      const elm = sectionToElement.get(ref) as HTMLElement;
      const rect = elm.getBoundingClientRect();

      entry.progress = verticalMode
        ? (Math.min(
            Math.max(
              rect.right +
                (firstDimensionMargin || 0) -
                innerWidth.current! +
                customReadingPointScrollOffset,
              0
            ),
            rect.width
          ) /
            (rect.width || 1)) *
          100
        : (Math.abs(
            Math.min(
              Math.max(
                rect.top - (firstDimensionMargin || 0) - customReadingPointScrollOffset,
                -rect.height
              ),
              0
            )
          ) /
            (rect.height || 1)) *
          100;

      sectionData.set(ref, entry);
    }

    willNavigate = false;
    bookTOCState.setSectionProgress(sectionData);
  }

  function onWheel(ev: WheelEvent) {
    if (verticalMode && !$disableWheelNavigation$ && !appShortcuts.disabled) {
      scrollFn(ev, fontSize, innerWidth.current!);
    }
  }

  function onBodyMousedown(e: MouseEvent) {
    if ($disableWheelNavigation$ && e.button === 1) {
      e.preventDefault();
    }
  }

  function onScroll() {
    requestAnimationFrame(() => {
      if (!calculator) return;

      exploredCharCount = calculator.calcExploredCharCount(customReadingPointScrollOffset);

      if (!isResizeScroll && exploredCharCount) {
        prevIntendedCharCount = exploredCharCount;
      }
      isResizeScroll = false;
    });
  }

  function initContent(el: HTMLElement) {
    calculator = new CharacterStatsCalculator(
      el,
      verticalMode ? 'vertical' : 'horizontal',
      verticalMode ? 'rtl' : 'ltr',
      document.documentElement,
      document
    );
    exploredCharCount = 0;
    prevIntendedCharCount = exploredCharCount;
    onbookcharcountchange?.(calculator.charCount);

    let fontLoaded: boolean;

    try {
      fontLoaded = document.fonts.check(`${fontSize}px ${fontFamilyGroupOne || 'Noto Serif JP'}`);
    } catch (error: any) {
      logger.error(`Error checking Font Load: ${error.message}`);
      fontLoaded = true;
    }

    if (fontLoaded) {
      oncontentchange?.(el);
    } else if (!fontLoadingAdded) {
      fontLoadingAdded = true;

      const timeout = isStoredFont(fontFamilyGroupOne, $userFonts$) ? 30000 : 10000;
      const fontLoadTimer = setTimeout(() => {
        if (!contentEl) {
          return;
        }

        logger.error(`Error loading primary Font: ${fontFamilyGroupOne}`);
        oncontentchange?.(contentEl);
      }, timeout);

      document.fonts.addEventListener('loadingdone', () => {
        clearTimeout(fontLoadTimer);

        if (contentEl) {
          oncontentchange?.(contentEl);
        }
      });
    }
  }

  function scrollToChapter(chapterId: string) {
    const targetElement = document.getElementById(chapterId);

    if (!targetElement) {
      return;
    }

    willNavigate = true;

    const rect = targetElement.getBoundingClientRect();

    if (verticalMode) {
      window.scrollBy(
        -(
          innerWidth.current! -
          rect.right -
          (firstDimensionMargin || 0) -
          customReadingPointScrollOffset -
          (!customReadingPointScrollOffset ||
          (customReadingPointScrollOffset && scrollAdjustment > customReadingPointScrollOffset)
            ? scrollAdjustment
            : 0)
        ),
        0
      );
    } else {
      window.scrollBy(
        0,
        rect.top -
          (firstDimensionMargin || 0) -
          customReadingPointScrollOffset -
          (!customReadingPointScrollOffset ||
          (customReadingPointScrollOffset && scrollAdjustment > customReadingPointScrollOffset)
            ? scrollAdjustment
            : 0)
      );
    }
  }
</script>

<div
  bind:this={contentEl}
  style:color={fontColor}
  style:font-size="{fontSize}px"
  style:line-height={lineHeight}
  style:max-width={!verticalMode && secondDimensionMaxValue
    ? `${secondDimensionMaxValue}px`
    : undefined}
  style:max-height={maxHeight ? `${maxHeight}px` : undefined}
  style:padding-left={verticalMode && firstDimensionMargin
    ? `${firstDimensionMargin}px`
    : undefined}
  style:padding-right={verticalMode && firstDimensionMargin
    ? `${firstDimensionMargin}px`
    : undefined}
  style:padding-top={!verticalMode && firstDimensionMargin
    ? `${firstDimensionMargin}px`
    : undefined}
  style:padding-bottom={!verticalMode && firstDimensionMargin
    ? `${firstDimensionMargin}px`
    : undefined}
  style:--font-family-serif={fontFamilyGroupOne}
  style:--font-family-sans-serif={fontFamilyGroupTwo}
  style:--book-content-hint-furigana-font-color={hintFuriganaFontColor}
  style:--book-content-hint-furigana-shadow-color={hintFuriganaShadowColor}
  style:--book-content-child-height="{maxHeight || height}px"
  style:--book-content-text-margin="{textMarginValue ?? 0}rem"
  style:--book-content-text-intendation="{textIndentation ?? 0}rem"
  style:font-feature-settings={fontFeatureSettings}
  style:text-orientation={verticalTextOrientation}
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
  lang="ja"
>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html htmlContent}
</div>

{#if firstDimensionMargin}
  <div
    class="fixed z-5"
    class:inset-y-0={verticalMode}
    class:inset-x-0={!verticalMode}
    style:background-color={backgroundColor}
    style="{fullLengthDimension}: 100%; {modifyingDimension}: {firstDimensionMargin}px; {boundSide[0]}: 0"
  ></div>
  <div
    class="fixed z-5"
    class:inset-y-0={verticalMode}
    class:inset-x-0={!verticalMode}
    style:background-color={backgroundColor}
    style="{fullLengthDimension}: 100%; {modifyingDimension}: {firstDimensionMargin}px; {boundSide[1]}: 0"
  ></div>
{/if}

{#if bookmarkPos}
  {#if verticalMode}
    <div
      class="pointer-events-none absolute text-xl opacity-25"
      style:color={fontColor}
      style:right={`calc(${bookmarkPos.right} + 1rem)`}
      style:top={bookmarkAdjustment}
    >
      <Fa icon={faBookmark} />
    </div>
  {:else}
    <div
      class="pointer-events-none absolute text-sm opacity-25 sm:text-xl"
      style:color={fontColor}
      style:left={bookmarkAdjustment}
      style:top={`calc(${bookmarkPos.top} + 1.5rem)`}
    >
      <Fa icon={faBookmark} />
    </div>
  {/if}
{/if}

{#if !allowDisplay}
  <div
    class="fixed inset-0 flex size-full items-center justify-center text-7xl"
    style:color={fontColor}
    style:background-color={backgroundColor}
  >
    <Fa icon={faSpinner} spin />
  </div>
{/if}

<svelte:window
  onscroll={onScroll}
  onresize={() => {
    if (autoPositionOnResize) {
      isResizeScroll = true;
    }
  }}
/>

<style>
  @import '../styles.css';

  .book-content {
    :global(svg),
    :global(img) {
      max-height: 100vh;
    }
  }

  .book-content--writing-vertical-rl {
    height: 100%;
    > :global(*) {
      margin-left: 6rem;
    }

    :global(img) {
      max-height: var(--book-content-child-height, 100%);
    }
  }

  .book-content--writing-horizontal-rl {
    > :global(*) {
      margin-bottom: 6rem;
    }

    :global(.grouped-image) {
      display: flex;
      flex-direction: row-reverse;
      justify-content: center;

      :global(svg) {
        margin: 0;
      }
    }
  }
</style>
