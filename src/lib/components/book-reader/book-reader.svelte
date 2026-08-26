<script lang="ts">
  import BookReaderContinuous from '$lib/components/book-reader/book-reader-continuous/book-reader-continuous.svelte';
  import { pxReader } from '$lib/components/book-reader/css-classes';
  import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
  import { FuriganaStyle } from '$lib/data/furigana-style';
  import type { TextMarginMode } from '$lib/data/text-margin-mode';
  import { ViewMode } from '$lib/data/view-mode';
  import { convertRemToPixels } from '$lib/functions/utils';
  import { logger } from '$lib/data/logger';
  import { watchImageLoadingState } from './image-loading-state';
  import { enhanceBookContent } from './book-content-enhancement';
  import type { BookReaderController } from './book-reader-controller.svelte';
  import BookReaderPaginated from './book-reader-paginated/book-reader-paginated.svelte';
  import { enableReaderWakeLock$, enableTapEdgeToFlip$ } from '$lib/data/store';
  import { onDestroy } from 'svelte';
  import { MediaQuery } from 'svelte/reactivity';

  interface BoxEdges {
    bottom: number;
    left: number;
    right: number;
    top: number;
  }

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
    textMarginMode: TextMarginMode;
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
    readerController: BookReaderController;
    onhideCustomReadingPoint?: () => void;
    onbookcharcountchange?: (count: number) => void;
    onisbookmarkscreenchange?: (value: boolean) => void;
    onbookmark?: () => void;
  }

  const pwaFullscreenDisplayMode = new MediaQuery('display-mode: fullscreen');

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
    textMarginMode,
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
    readerController,
    onhideCustomReadingPoint,
    onbookcharcountchange,
    onisbookmarkscreenchange,
    onbookmark
  }: Props = $props();

  let showBlurMessage = $state(false);

  let wakeLock: WakeLockSentinel | undefined;

  let visibilityState: DocumentVisibilityState = $state('hidden');

  let containerEl = $state<HTMLElement>();
  let contentEl = $state<HTMLElement>();
  let contentVersion = $state(0);
  let loadingState = $state(true);
  let containerPadding = $state<BoxEdges>();

  const mutationObserver: MutationObserver = new MutationObserver(handleMutation);

  let heightModifier = $derived(
    firstDimensionMargin && ViewMode.Paginated === viewMode && !verticalMode
      ? firstDimensionMargin * 2
      : 0
  );
  let tapEdgeWidth = $derived(
    $enableTapEdgeToFlip$ &&
      ViewMode.Paginated === viewMode &&
      !verticalMode &&
      typeof window !== 'undefined'
      ? convertRemToPixels(window, 1.75)
      : 0
  );
  let contentViewportWidth = $derived(
    containerPadding
      ? getAdjustedWidth(width - containerPadding.left - containerPadding.right - tapEdgeWidth)
      : 0
  );
  let contentViewportHeight = $derived(
    containerPadding
      ? getAdjustedHeight(height - containerPadding.top - containerPadding.bottom - heightModifier)
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

  $effect(() => {
    const el = contentEl;
    const version = contentVersion;
    if (!el || !version) {
      loadingState = true;
      return;
    }

    const attachBookContent = enhanceBookContent({
      readerController,
      furiganaStyle,
      hideSpoilerImage,
      isPWADisplayMode: isInPWADisplayMode()
    });
    const cleanupEnhancement = attachBookContent(el);
    const cleanupImageLoading = watchImageLoadingState(el, (loading) => {
      loadingState = loading;
    });

    mutationObserver.observe(el, { attributes: true });

    return () => {
      cleanupEnhancement?.();
      cleanupImageLoading();
      mutationObserver.disconnect();
    };
  });

  $effect(() => {
    if (!containerEl || width <= 0 || height <= 0) {
      containerPadding = undefined;
      return;
    }

    const frame = scheduleContainerPaddingUpdate(containerEl);

    return () => cancelAnimationFrame(frame);
  });

  function scheduleContainerPaddingUpdate(el: HTMLElement) {
    return requestAnimationFrame(() => {
      const style = getComputedStyle(el);
      containerPadding = {
        bottom: parsePx(style.paddingBottom),
        left: parsePx(style.paddingLeft),
        right: parsePx(style.paddingRight),
        top: parsePx(style.paddingTop)
      };
    });
  }

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

  function handleContentChange(el: HTMLElement) {
    contentEl = el;
    contentVersion += 1;
  }

  function isInPWADisplayMode() {
    // The manifest uses `display: fullscreen`, so this is PWA display mode, not the browser
    // Fullscreen API. Toggling reader fullscreen should not enable PWA-only image behavior.
    return navigator.standalone || pwaFullscreenDisplayMode.current;
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
      width={contentViewportWidth}
      height={contentViewportHeight}
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
      {textMarginMode}
      {textMarginValue}
      {hideSpoilerImage}
      {furiganaStyle}
      {secondDimensionMaxValue}
      {firstDimensionMargin}
      {autoBookmark}
      {autoBookmarkTime}
      {multiplier}
      {loadingState}
      {bookmarkData}
      {customReadingPoint}
      bind:exploredCharCount
      bind:customReadingPointTop
      bind:customReadingPointLeft
      bind:customReadingPointScrollOffset
      {readerController}
      {onbookcharcountchange}
      oncontentchange={handleContentChange}
      {onbookmark}
    />
  {:else}
    <BookReaderPaginated
      {htmlContent}
      width={contentViewportWidth}
      height={contentViewportHeight}
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
      {textMarginMode}
      {textMarginValue}
      {hideSpoilerImage}
      {furiganaStyle}
      {loadingState}
      {avoidPageBreak}
      {pageColumns}
      {autoBookmark}
      {autoBookmarkTime}
      {firstDimensionMargin}
      {bookmarkData}
      bind:exploredCharCount
      bind:customReadingPointRange
      {readerController}
      {onhideCustomReadingPoint}
      {onbookcharcountchange}
      {onisbookmarkscreenchange}
      oncontentchange={handleContentChange}
      {onbookmark}
    />
  {/if}
</div>
<svelte:document bind:visibilityState />
