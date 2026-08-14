<script lang="ts">
  import { faBookmark as farBookmark } from '@fortawesome/free-regular-svg-icons';
  import {
    faBookmark as fasBookmark,
    faCrosshairs,
    faEllipsis,
    faExpand,
    faFlag,
    faHashtag,
    faImages,
    faList,
    faRotateLeft
  } from '@fortawesome/free-solid-svg-icons';
  import { readerImageGallery } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery-state.svelte';
  import HeaderButton, { type HeaderAction } from '$lib/components/header-button.svelte';
  import HeaderMenuButton from '$lib/components/header-menu-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import { baseHeaderClasses, headerDividerClasses } from '$lib/css-classes';
  import { deviceEnvironment } from '$lib/data/device-environment.svelte';
  import { customReadingPointEnabled$, viewMode$ } from '$lib/data/store';
  import { ViewMode } from '$lib/data/view-mode';

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
    isBookCompleted: boolean;
    oncompleteBook?: () => void;
    onuncompleteBook?: () => void;
    onfullscreenClick?: () => void;
    onshowCustomReadingPoint?: () => void;
    onsetCustomReadingPoint?: () => void;
    onresetCustomReadingPoint?: () => void;
    onreaderImageGalleryClick?: () => void;
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
    isBookCompleted,
    oncompleteBook,
    onuncompleteBook,
    onfullscreenClick,
    onshowCustomReadingPoint,
    onsetCustomReadingPoint,
    onresetCustomReadingPoint,
    onreaderImageGalleryClick
  }: Props = $props();

  let customReadingPointMenuItems = $derived([
    ...(hasCustomReadingPoint ? [{ label: 'Show Point', onclick: onshowCustomReadingPoint }] : []),
    { label: 'Set Point', onclick: onsetCustomReadingPoint },
    ...(hasCustomReadingPoint ? [{ label: 'Reset Point', onclick: onresetCustomReadingPoint }] : [])
  ]);
  let showCustomReadingPointMenu = $derived(
    $customReadingPointEnabled$ || $viewMode$ === ViewMode.Paginated
  );
  let secondaryActions: HeaderAction[] = $derived([
    {
      faIcon: faFlag,
      label: isBookCompleted ? 'Undo Complete' : 'Complete Book',
      title: isBookCompleted ? 'Mark book as not completed' : 'Mark book as completed',
      onclick: () => (isBookCompleted ? onuncompleteBook?.() : oncompleteBook?.())
    },
    ...(showFullscreenButton
      ? [
          {
            faIcon: faExpand,
            label: 'Fullscreen',
            title: 'Toggle fullscreen',
            onclick: () => onfullscreenClick?.()
          }
        ]
      : []),
    ...(hasText
      ? [
          {
            faIcon: faHashtag,
            label: 'Jump',
            menuLabel: 'Jump to Character',
            title: 'Jump to character',
            onclick: () => onjumpClick?.()
          }
        ]
      : []),
    ...(readerImageGallery.hasPictures
      ? [
          {
            faIcon: faImages,
            label: 'Images',
            menuLabel: 'Open Image Gallery',
            title: 'Open image gallery',
            onclick: () => onreaderImageGalleryClick?.()
          }
        ]
      : [])
  ]);
  let mobileMenuItems = $derived([
    ...secondaryActions,
    ...(showCustomReadingPointMenu ? customReadingPointMenuItems : [])
  ]);
</script>

<div
  data-mobile-actions
  class="grid grid-flow-col auto-cols-fr md:flex md:justify-between {baseHeaderClasses}"
>
  <div class="contents md:flex">
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
        mobileLabel="Return"
        onclick={() => onscrollToBookmarkClick?.()}
      />
    {/if}
    {#if $viewMode$ === ViewMode.Continuous && !deviceEnvironment.isMobile}
      <div class="hidden items-center px-4 text-xl md:flex" title="Current autoscroll speed">
        {autoScrollMultiplier}x
      </div>
    {/if}
    <div class="hidden md:contents">
      {#each secondaryActions as secondaryAction (secondaryAction.label)}
        <HeaderButton {...secondaryAction} />
      {/each}
    </div>
    <div class="contents md:hidden">
      <HeaderMenuButton
        faIcon={faEllipsis}
        title="More reader actions"
        label="More"
        fill
        items={mobileMenuItems}
      />
    </div>
  </div>

  <div class="hidden md:flex">
    {#if showCustomReadingPointMenu}
      <HeaderMenuButton
        faIcon={faCrosshairs}
        title="Open custom point actions"
        label="Point"
        items={customReadingPointMenuItems}
      />
      <div class={headerDividerClasses}></div>
    {/if}
    <HeaderNavTabs />
  </div>
</div>
