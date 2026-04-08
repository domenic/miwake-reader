<script lang="ts">
  import { faBookmark as farBookmark } from '@fortawesome/free-regular-svg-icons';
  import {
    faBookmark as fasBookmark,
    faCrosshairs,
    faExpand,
    faFlag,
    faHashtag,
    faImages,
    faList,
    faRotateLeft
  } from '@fortawesome/free-solid-svg-icons';
  import { readerImageGalleryPictures$ } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery';
  import HeaderButton from '$lib/components/header-button.svelte';
  import HeaderMenuButton from '$lib/components/header-menu-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import {
    baseHeaderClasses,
    headerDividerClasses,
    nTranslateXHeaderFa,
    translateXHeaderFa
  } from '$lib/css-classes';
  import { customReadingPointEnabled$, viewMode$ } from '$lib/data/store';
  import { ViewMode } from '$lib/data/view-mode';
  import { isMobile$ } from '$lib/functions/utils';

  interface Props {
    hasChapterData: boolean;
    hasText: boolean;
    autoScrollMultiplier: number;
    hasCustomReadingPoint: boolean;
    showFullscreenButton: boolean;
    isBookmarkScreen: boolean;
    hasBookmarkData: boolean;
    ontocClick?: () => void;
    onbookmarkClick?: () => void;
    onscrollToBookmarkClick?: () => void;
    onjumpClick?: () => void;
    oncompleteBook?: () => void;
    onfullscreenClick?: () => void;
    onshowCustomReadingPoint?: () => void;
    onsetCustomReadingPoint?: () => void;
    onresetCustomReadingPoint?: () => void;
    onstatisticsClick?: () => void;
    onreaderImageGalleryClick?: () => void;
    onsettingsClick?: () => void;
    onbookManagerClick?: () => void;
  }

  let {
    hasChapterData,
    hasText,
    autoScrollMultiplier,
    hasCustomReadingPoint,
    showFullscreenButton,
    isBookmarkScreen = $bindable(),
    hasBookmarkData,
    ontocClick,
    onbookmarkClick,
    onscrollToBookmarkClick,
    onjumpClick,
    oncompleteBook,
    onfullscreenClick,
    onshowCustomReadingPoint,
    onsetCustomReadingPoint,
    onresetCustomReadingPoint,
    onstatisticsClick,
    onreaderImageGalleryClick,
    onsettingsClick,
    onbookManagerClick
  }: Props = $props();

  let customReadingPointMenuItems = $derived([
    ...(hasCustomReadingPoint ? [{ label: 'Show Point', action: onshowCustomReadingPoint }] : []),
    { label: 'Set Point', action: onsetCustomReadingPoint },
    ...(hasCustomReadingPoint ? [{ label: 'Reset Point', action: onresetCustomReadingPoint }] : [])
  ]);
</script>

<div class="flex justify-between px-4 md:px-8 {baseHeaderClasses}">
  <div class="flex transform-gpu {nTranslateXHeaderFa}">
    {#if hasChapterData}
      <HeaderButton
        faIcon={faList}
        title="Open table of contents"
        label="TOC"
        onclick={() => ontocClick?.()}
      />
    {/if}
    <HeaderButton
      faIcon={isBookmarkScreen ? fasBookmark : farBookmark}
      title="Create bookmark"
      label="Bookmark"
      onclick={() => onbookmarkClick?.()}
    />
    {#if hasBookmarkData}
      <HeaderButton
        faIcon={faRotateLeft}
        title="Return to bookmark"
        label="Return to Bookmark"
        onclick={() => onscrollToBookmarkClick?.()}
      />
    {/if}
    {#if $viewMode$ === ViewMode.Continuous && !$isMobile$}
      <div
        class="flex items-center px-4 text-xl xl:px-3 xl:text-lg"
        title="Current autoscroll speed"
      >
        {autoScrollMultiplier}x
      </div>
    {/if}
    <HeaderButton
      faIcon={faFlag}
      title="Complete book"
      label="Complete Book"
      onclick={() => oncompleteBook?.()}
    />
    {#if showFullscreenButton}
      <HeaderButton
        faIcon={faExpand}
        title="Toggle fullscreen"
        label="Fullscreen"
        onclick={() => onfullscreenClick?.()}
      />
    {/if}
    {#if hasText}
      <HeaderButton
        faIcon={faHashtag}
        title="Jump to character"
        label="Jump"
        onclick={() => onjumpClick?.()}
      />
    {/if}
    {#if $readerImageGalleryPictures$.length}
      <HeaderButton
        faIcon={faImages}
        title="Open image gallery"
        label="Images"
        onclick={() => onreaderImageGalleryClick?.()}
      />
    {/if}
  </div>

  <div class="flex transform-gpu {translateXHeaderFa}">
    {#if $customReadingPointEnabled$ || $viewMode$ === ViewMode.Paginated}
      <HeaderMenuButton
        faIcon={faCrosshairs}
        title="Open custom point actions"
        label="Point"
        items={customReadingPointMenuItems}
        onselect={(actionItem) => actionItem.action?.()}
      />
      <div class={headerDividerClasses}></div>
    {/if}
    <HeaderNavTabs
      disableNavigation
      onnavigate={(routeId) => {
        if (routeId === '/statistics') onstatisticsClick?.();
        else if (routeId === '/settings') onsettingsClick?.();
        else if (routeId === '/manage') onbookManagerClick?.();
      }}
    />
  </div>
</div>
