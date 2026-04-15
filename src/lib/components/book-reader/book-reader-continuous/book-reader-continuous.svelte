<script lang="ts">
  import { browser } from '$app/environment';
  import {
    nextChapter$,
    sectionList$,
    sectionProgress$,
    type SectionWithProgress
  } from '$lib/components/book-reader/book-toc/book-toc';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { isStoredFont } from '$lib/data/fonts';
  import { FuriganaStyle } from '$lib/data/furigana-style';
  import { logger } from '$lib/data/logger';
  import {
    customReadingPointEnabled$,
    disableWheelNavigation$,
    skipKeyDownListener$,
    userFonts$
  } from '$lib/data/store';
  import { prependValue } from '$lib/functions/file-loaders/epub/generate-epub-html';
  import { getReferencePoints } from '$lib/functions/range-util';
  import { getExternalTargetElement } from '$lib/functions/utils';
  import { faBookmark, faSpinner } from '@fortawesome/free-solid-svg-icons';
  import {
    animationFrameScheduler,
    combineLatest,
    debounce,
    debounceTime,
    distinctUntilChanged,
    EMPTY,
    filter,
    fromEvent,
    map,
    observeOn,
    skip,
    Subject,
    switchMap,
    take,
    takeUntil,
    timer
  } from 'rxjs';
  import { onDestroy, onMount, untrack } from 'svelte';
  import Fa from 'svelte-fa';
  import type { AutoScroller, BookmarkManager, PageManager } from '../types';
  import { AutoScrollerContinuous } from './auto-scroller-continuous';
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
    onpagemanagerchange?: (pm: PageManager) => void;
    onbookmarkmanagerchange?: (bm: BookmarkManager) => void;
    onautoscrollerchange?: (as: AutoScroller) => void;
    onbookcharcountchange?: (count: number) => void;
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
    onpagemanagerchange,
    onbookmarkmanagerchange,
    onautoscrollerchange,
    onbookcharcountchange,
    onbookmark,
    oncontentchange,
    ontrackerPause
  }: Props = $props();

  let allowDisplay = $state(false);

  let contentEl = $state<HTMLElement>();

  let calculator = $state<CharacterStatsCalculator>();

  let contentReadyEvent = $state({});

  let autoScrollerConcrete: AutoScrollerContinuous | undefined;

  let bookmarkManagerConcrete: BookmarkManagerContinuous | undefined;

  let pageManagerConcrete: PageManagerContinuous | undefined;

  let bookmarkPos = $state<BookmarkPosData>();

  let scrollWhenReady: boolean;

  let prevIntendedCharCount = 0;

  let isResizeScroll = false;

  let fontLoadingAdded = false;

  const scrollFn = browser
    ? horizontalMouseWheel(4, document.documentElement, requestAnimationFrame)
    : () => 0;

  const width$ = new Subject<number>();

  const height$ = new Subject<number>();

  const destroy$ = new Subject<void>();

  const sectionToElement = new Map<string, HTMLElement>();

  const sectionData = new Map<string, SectionWithProgress>();

  let scrollAdjustment = 0;

  let willNavigate = false;

  let fullLengthDimension = $derived(verticalMode ? 'height' : 'width');

  let modifyingDimension = $derived(verticalMode ? 'width' : 'height');

  let boundSide = $derived(
    verticalMode ? (['left', 'right'] as const) : (['top', 'bottom'] as const)
  );

  let maxHeight = $derived(
    verticalMode && secondDimensionMaxValue ? secondDimensionMaxValue : undefined
  );

  let bookmarkAdjustment = $derived.by(() => {
    const base = window.matchMedia('(min-width: 640px)').matches ? '0.5rem' : '0.25rem';

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

  // Push width/height changes to subjects
  $effect(() => {
    width$.next(width);
  });

  $effect(() => {
    height$.next(height);
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

  // Keep autoScroller props in sync
  $effect(() => {
    if (autoScrollerConcrete) {
      autoScrollerConcrete.multiplier = multiplier;
      autoScrollerConcrete.verticalMode = verticalMode;
    }
  });

  // Create bookmarkManager when calculator is available
  $effect(() => {
    if (browser && calculator) {
      bookmarkManagerConcrete = new BookmarkManagerContinuous(
        calculator,
        window,
        firstDimensionMargin || 0
      );
      onbookmarkmanagerchange?.(bookmarkManagerConcrete);
    }
  });

  // Update bookmark position when contentReadyEvent changes
  $effect(() => {
    if (contentReadyEvent) {
      bookmarkPos = undefined;
      bookmarkData.then((data) => {
        if (!data) return;
        bookmarkPos = bookmarkManagerConcrete?.getBookmarkBarPosition(data);
      });
    }
  });

  // Create pageManager when verticalMode or firstDimensionMargin change
  $effect(() => {
    if (browser) {
      pageManagerConcrete = new PageManagerContinuous(verticalMode, firstDimensionMargin, window);
      onpagemanagerchange?.(pageManagerConcrete);
    }
  });

  // Update custom reading point position
  $effect(() => {
    if ($customReadingPointEnabled$ && contentEl && Number.isFinite(customReadingPoint)) {
      updateCustomReadingPointPosition();
      onScroll();
      updateSectionProgress();
    }
  });

  // Create autoScroller on mount (values synced reactively via $effect above)
  onMount(() => {
    autoScrollerConcrete = new AutoScrollerContinuous(multiplier, verticalMode, destroy$, document);
    onautoscrollerchange?.(autoScrollerConcrete);
  });

  // Resize scroll subscription
  combineLatest([width$, height$])
    .pipe(
      filter(() => autoPositionOnResize),
      skip(1),
      map(([w, h]) => (verticalMode ? h : w)),
      distinctUntilChanged(),
      debounceTime(10),
      observeOn(animationFrameScheduler),
      takeUntil(destroy$)
    )
    .subscribe(() => {
      if (!calculator || !pageManagerConcrete) return;

      const scrollPos =
        calculator.getScrollPosByCharCount(prevIntendedCharCount) +
        (verticalMode ? customReadingPointScrollOffset : -customReadingPointScrollOffset);
      isResizeScroll = true;
      pageManagerConcrete.scrollTo(scrollPos);
    });

  /** Experimental Code - May be removed any time without warning */
  onMount(() => {
    document.addEventListener('miwake-action', handleAction, false);

    // Register wheel handler with { passive: false } since Svelte 5 doesn't support |nonpassive
    document.body.addEventListener('wheel', onWheel, { passive: false });

    // Register mousedown handler on body
    document.body.addEventListener('mousedown', onBodyMousedown);

    return () => {
      document.body.removeEventListener('wheel', onWheel);
      document.body.removeEventListener('mousedown', onBodyMousedown);
    };
  });

  function handleAction({ detail }: any) {
    if (!detail.type) {
      return;
    }

    if (detail.type === 'cue') {
      const { scroll, rect } = needScroll(detail.selector, detail.scrollMode);

      if (!scroll) {
        return;
      }

      willNavigate = true;

      if (verticalMode) {
        window.scrollBy({
          left: -(
            window.innerWidth -
            rect.right -
            (firstDimensionMargin || 0) -
            customReadingPointScrollOffset -
            (!customReadingPointScrollOffset ||
            (customReadingPointScrollOffset && scrollAdjustment > customReadingPointScrollOffset)
              ? scrollAdjustment
              : 0)
          ),
          top: 0,
          behavior: detail.scrollBehavior || 'instant'
        });
      } else {
        window.scrollBy({
          left: 0,
          top:
            rect.top -
            (firstDimensionMargin || 0) -
            customReadingPointScrollOffset -
            (!customReadingPointScrollOffset ||
            (customReadingPointScrollOffset && scrollAdjustment > customReadingPointScrollOffset)
              ? scrollAdjustment
              : 0),
          behavior: detail.scrollBehavior || 'instant'
        });
      }
    } else if (
      detail.type === 'pauseTracker' &&
      needScroll(detail.selector, detail.scrollMode).scroll
    ) {
      ontrackerPause?.();
    }
  }

  function needScroll(selector: string, scrollMode: string) {
    const targetElement = getExternalTargetElement(document, selector, !verticalMode);

    if (!targetElement || !contentEl) {
      return { scroll: false, rect: { top: 0, right: 0, bottom: 0, left: 0 } };
    }

    const rect = targetElement.getBoundingClientRect();

    if (!scrollMode || scrollMode === 'Always') {
      return { scroll: true, rect };
    }

    const footerElement = verticalMode ? null : document.getElementById('miwake-page-footer');
    const {
      elTopReferencePoint,
      elLeftReferencePoint,
      elBottomReferencePoint,
      elRightReferencePoint
    } = getReferencePoints(
      window,
      contentEl,
      verticalMode,
      firstDimensionMargin,
      !verticalMode && footerElement
        ? Number.parseFloat(getComputedStyle(footerElement).height.replace('px', ''))
        : 0
    );

    if (verticalMode) {
      return {
        scroll: rect.left <= elLeftReferencePoint || rect.right >= elRightReferencePoint,
        rect
      };
    }

    return {
      scroll: rect.top <= elTopReferencePoint || rect.bottom >= elBottomReferencePoint,
      rect
    };
  }
  /** Experimental Code - May be removed any time without warning */

  onDestroy(() => {
    document.removeEventListener('miwake-action', handleAction, false);

    destroy$.next();
    destroy$.complete();
  });

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
        window.innerWidth - firstDimensionMarginValue - customReadingPointLeft;

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
          if (!data || !bookmarkManagerConcrete) {
            return;
          }

          prevIntendedCharCount = data.exploredCharCount || 0;
          bookmarkManagerConcrete.scrollToBookmark(data, customReadingPointScrollOffset);
        })
        .finally(() => {
          if (autoBookmark) {
            fromEvent(window, 'scroll')
              .pipe(skip(1), debounceTime(autoBookmarkTime * 1000), takeUntil(destroy$))
              .subscribe(() => {
                onbookmark?.();
              });
          }

          sectionList$
            .pipe(
              take(1),
              switchMap((sections) => {
                if (!sections.length) {
                  return EMPTY;
                }

                sections.forEach((section) => {
                  const ref = section.reference;
                  const elm = document.getElementById(ref);

                  if (elm) {
                    if (!scrollAdjustment) {
                      scrollAdjustment =
                        Number(
                          getComputedStyle(elm)[
                            verticalMode ? 'marginLeft' : 'marginBottom'
                          ].replace(/px$/, '')
                        ) / 2;
                    }

                    sectionData.set(ref, { ...section, progress: 0 });
                    sectionToElement.set(ref, elm);
                  }
                });

                if (sectionToElement.size) {
                  updateSectionProgress();

                  return fromEvent(window, 'scroll');
                }
                return EMPTY;
              }),
              debounce(() => timer(willNavigate ? 100 : 500)),
              takeUntil(destroy$)
            )
            .subscribe(updateSectionProgress);
        });
    }
    contentReadyEvent = {};
    allowDisplay = true;
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
                window.innerWidth +
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
    sectionProgress$.next(sectionData);
  }

  function onWheel(ev: WheelEvent) {
    if (verticalMode && !$disableWheelNavigation$ && !$skipKeyDownListener$) {
      scrollFn(ev, fontSize, window.innerWidth);
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

    let fontLoaded = false;

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

  nextChapter$.pipe(takeUntil(destroy$)).subscribe((chapterId) => {
    let targetElement = document.getElementById(chapterId);

    if (!targetElement) {
      return;
    }

    const checkForParent = !chapterId.startsWith(prependValue);

    targetElement = checkForParent
      ? targetElement.closest(`div[id^="${prependValue}"]`) || targetElement
      : targetElement;

    willNavigate = true;

    const rect = targetElement.getBoundingClientRect();

    if (verticalMode) {
      window.scrollBy(
        -(
          window.innerWidth -
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
  });
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
  class:ttu-text-wrap-pretty={enableTextWrapPretty}
  class="book-content m-auto"
>
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
    class="fixed inset-0 flex h-full w-full items-center justify-center text-7xl"
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
