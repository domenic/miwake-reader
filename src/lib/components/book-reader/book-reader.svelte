<script lang="ts">
  import {
    animationFrameScheduler,
    BehaviorSubject,
    combineLatest,
    debounceTime,
    filter,
    map,
    mergeMap,
    of,
    ReplaySubject,
    share,
    shareReplay,
    startWith,
    Subject,
    tap
  } from 'rxjs';
  import BookReaderContinuous from '$lib/components/book-reader/book-reader-continuous/book-reader-continuous.svelte';
  import { pxReader } from '$lib/components/book-reader/css-classes';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { FuriganaStyle } from '$lib/data/furigana-style';
  import { ViewMode } from '$lib/data/view-mode';
  import { iffBrowser } from '$lib/functions/rxjs/iff-browser';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';
  import { convertRemToPixels } from '$lib/functions/utils';
  import { logger } from '$lib/data/logger';
  import { imageLoadingState } from './image-loading-state';
  import { reactiveElements } from './reactive-elements';
  import type { AutoScroller, BookmarkManager, PageManager } from './types';
  import BookReaderPaginated from './book-reader-paginated/book-reader-paginated.svelte';
  import { enableReaderWakeLock$, enableTapEdgeToFlip$ } from '$lib/data/store';
  import { onDestroy } from 'svelte';

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
    textIndentation: number;
    textMarginValue: number;
    fontColor: string;
    backgroundColor: string;
    hintFuriganaFontColor: string;
    hintFuriganaShadowColor: string;
    fontFamilyGroupOne: string;
    fontFamilyGroupTwo: string;
    fontSize: number;
    lineHeight: number;
    hideSpoilerImage: boolean;
    furiganaStyle: FuriganaStyle;
    secondDimensionMaxValue: number;
    firstDimensionMargin: number;
    autoPositionOnResize: boolean;
    avoidPageBreak: boolean;
    pageColumns: number;
    autoBookmark: boolean;
    autoBookmarkTime: number;
    viewMode: ViewMode;
    exploredCharCount: number;
    multiplier: number;
    bookmarkData: Promise<BooksDbBookmarkData | undefined>;
    customReadingPoint: number;
    customReadingPointTop: number;
    customReadingPointLeft: number;
    customReadingPointScrollOffset: number;
    customReadingPointRange: Range | undefined;
    showCustomReadingPoint: boolean;
    onpagemanagerchange?: (pm: PageManager | undefined) => void;
    onbookmarkmanagerchange?: (bm: BookmarkManager | undefined) => void;
    onautoscrollerchange?: (as: AutoScroller | undefined) => void;
    onbookcharcountchange?: (count: number) => void;
    onisbookmarkscreenchange?: (value: boolean) => void;
    onbookmark?: () => void;
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
    textIndentation,
    textMarginValue,
    fontColor,
    backgroundColor,
    hintFuriganaFontColor,
    hintFuriganaShadowColor,
    fontFamilyGroupOne,
    fontFamilyGroupTwo,
    fontSize,
    lineHeight,
    hideSpoilerImage,
    furiganaStyle,
    secondDimensionMaxValue,
    firstDimensionMargin,
    autoPositionOnResize,
    avoidPageBreak,
    pageColumns,
    autoBookmark,
    autoBookmarkTime,
    viewMode,
    exploredCharCount = $bindable(),
    multiplier,
    bookmarkData,
    customReadingPoint,
    customReadingPointTop = $bindable(),
    customReadingPointLeft = $bindable(),
    customReadingPointScrollOffset = $bindable(),
    customReadingPointRange = $bindable(),
    showCustomReadingPoint = $bindable(),
    onpagemanagerchange,
    onbookmarkmanagerchange,
    onautoscrollerchange,
    onbookcharcountchange,
    onisbookmarkscreenchange,
    onbookmark,
    ontrackerPause
  }: Props = $props();

  let showBlurMessage = $state(false);

  let wakeLock: WakeLockSentinel | undefined;

  let visibilityState: DocumentVisibilityState = $state('hidden');

  let containerEl = $state<HTMLElement>();

  const mutationObserver: MutationObserver = new MutationObserver(handleMutation);

  const width$ = new Subject<number>();

  const height$ = new Subject<number>();

  const containerEl$ = new BehaviorSubject<HTMLElement | null>(null);

  $effect(() => {
    containerEl$.next(containerEl ?? null);
  });

  let heightModifer = $derived(
    firstDimensionMargin && ViewMode.Paginated === viewMode && !verticalMode
      ? firstDimensionMargin * 2
      : 0
  );

  $effect(() => {
    if ($enableReaderWakeLock$ && visibilityState === 'visible') {
      setTimeout(requestWakeLock, 500);
    }
  });

  onDestroy(() => {
    mutationObserver.disconnect();

    releaseWakeLock();
  });

  const computedStyle$ = combineLatest([
    containerEl$.pipe(filter((el): el is HTMLElement => !!el)),
    combineLatest([width$, height$]).pipe(startWith(0))
  ]).pipe(
    debounceTime(0, animationFrameScheduler),
    map(([el]) => getComputedStyle(el)),
    shareReplay({ refCount: true, bufferSize: 1 })
  );

  const contentEl$ = new ReplaySubject<HTMLElement>(1);

  const contentViewportWidth$ = computedStyle$.pipe(
    map((style) =>
      getAdjustedWidth(
        width -
          parsePx(style.paddingLeft) -
          parsePx(style.paddingRight) -
          ($enableTapEdgeToFlip$ && ViewMode.Paginated === viewMode && !verticalMode
            ? convertRemToPixels(window, 1.75)
            : 0)
      )
    )
  );

  const contentViewportHeight$ = computedStyle$.pipe(
    map((style) =>
      getAdjustedHeight(
        height - parsePx(style.paddingTop) - parsePx(style.paddingBottom) - heightModifer
      )
    )
  );

  const reactiveElements$ = iffBrowser(() => of(document)).pipe(
    mergeMap((document) => {
      const reactiveElementsFn = reactiveElements(
        document,
        furiganaStyle,
        hideSpoilerImage,
        navigator.standalone || window.matchMedia('(display-mode: fullscreen)').matches
      );
      return contentEl$.pipe(mergeMap((contentEl) => reactiveElementsFn(contentEl)));
    }),
    reduceToEmptyString()
  );

  const imageLoadingState$ = contentEl$.pipe(
    mergeMap((contentEl) => imageLoadingState(contentEl)),
    share()
  );

  const blurListener$ = contentEl$.pipe(
    tap((contentEl) => {
      mutationObserver.disconnect();
      mutationObserver.observe(contentEl, { attributes: true });
    }),
    reduceToEmptyString()
  );

  $effect(() => {
    width$.next(width);
  });

  $effect(() => {
    height$.next(height);
  });

  function getAdjustedWidth(widthValue: number) {
    if (ViewMode.Paginated === viewMode && !verticalMode && secondDimensionMaxValue) {
      return Math.min(secondDimensionMaxValue, widthValue);
    }
    return widthValue;
  }

  function getAdjustedHeight(heightValue: number) {
    if (ViewMode.Paginated === viewMode && verticalMode && secondDimensionMaxValue) {
      return Math.min(secondDimensionMaxValue, heightValue);
    }
    return heightValue;
  }

  function parsePx(px: string) {
    return Number(px.replace(/px$/, ''));
  }

  function handleMutation([mutation]: MutationRecord[]) {
    if (!(mutation.target instanceof HTMLElement)) {
      showBlurMessage = false;
      return;
    }

    showBlurMessage = mutation.target.style.filter.includes('blur-sm');
  }

  async function requestWakeLock() {
    if (wakeLock && !wakeLock.released) {
      return;
    }

    wakeLock = await navigator.wakeLock.request().catch(({ message }) => {
      logger.error(`failed to request wakelock: ${message}`);

      return undefined;
    });

    if (wakeLock) {
      wakeLock.addEventListener('release', releaseWakeLock, false);
    }
  }

  async function releaseWakeLock() {
    if (wakeLock && !wakeLock.released) {
      await wakeLock.release().catch(() => {
        // no-op
      });
    }

    wakeLock = undefined;
  }
</script>

{#if showBlurMessage}
  <div
    class="fixed top-12 right-4 p-2 border max-w-[90vw] z-1"
    style:writing-mode="horizontal-tb"
    style:color={fontColor}
    style:background-color={backgroundColor}
    style:border-color={fontColor}
  >
    The reader is currently blurred due to an external application (e. g. exstatic)
  </div>
{/if}
<div bind:this={containerEl} class="{pxReader} py-8">
  {#if viewMode === ViewMode.Continuous}
    <BookReaderContinuous
      {htmlContent}
      width={$contentViewportWidth$ ?? 0}
      height={$contentViewportHeight$ ?? 0}
      {verticalMode}
      {fontFeatureSettings}
      {verticalTextOrientation}
      {prioritizeReaderStyles}
      {enableTextJustification}
      {enableTextWrapPretty}
      {fontColor}
      {backgroundColor}
      {hintFuriganaFontColor}
      {hintFuriganaShadowColor}
      {fontFamilyGroupOne}
      {fontFamilyGroupTwo}
      {fontSize}
      {lineHeight}
      {textIndentation}
      {textMarginValue}
      {hideSpoilerImage}
      {furiganaStyle}
      {secondDimensionMaxValue}
      {firstDimensionMargin}
      {autoPositionOnResize}
      {autoBookmark}
      {autoBookmarkTime}
      {multiplier}
      loadingState={$imageLoadingState$ ?? true}
      {bookmarkData}
      {customReadingPoint}
      bind:exploredCharCount
      bind:customReadingPointTop
      bind:customReadingPointLeft
      bind:customReadingPointScrollOffset
      {onpagemanagerchange}
      {onbookmarkmanagerchange}
      {onautoscrollerchange}
      {onbookcharcountchange}
      oncontentchange={(el) => contentEl$.next(el)}
      {onbookmark}
      {ontrackerPause}
    />
  {:else}
    <BookReaderPaginated
      {htmlContent}
      width={$contentViewportWidth$ ?? 0}
      height={$contentViewportHeight$ ?? 0}
      {verticalMode}
      {fontFeatureSettings}
      {verticalTextOrientation}
      {prioritizeReaderStyles}
      {enableTextJustification}
      {enableTextWrapPretty}
      {fontColor}
      {backgroundColor}
      {hintFuriganaFontColor}
      {hintFuriganaShadowColor}
      {fontFamilyGroupOne}
      {fontFamilyGroupTwo}
      {fontSize}
      {lineHeight}
      {textIndentation}
      {textMarginValue}
      {hideSpoilerImage}
      {furiganaStyle}
      loadingState={$imageLoadingState$ ?? true}
      {avoidPageBreak}
      {pageColumns}
      {autoBookmark}
      {autoBookmarkTime}
      {firstDimensionMargin}
      {bookmarkData}
      bind:exploredCharCount
      bind:customReadingPointRange
      bind:showCustomReadingPoint
      {onpagemanagerchange}
      {onbookmarkmanagerchange}
      {onbookcharcountchange}
      {onisbookmarkscreenchange}
      oncontentchange={(el) => contentEl$.next(el)}
      {onbookmark}
      {ontrackerPause}
    />
  {/if}
</div>
{$blurListener$ ?? ''}
{$reactiveElements$ ?? ''}
<svelte:document bind:visibilityState />
