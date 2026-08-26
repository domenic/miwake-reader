<script lang="ts">
  import { faBookmark as farBookmark } from '@fortawesome/free-regular-svg-icons';
  import {
    faBookmark as fasBookmark,
    faCrosshairs,
    faEllipsis,
    faExpand,
    faEye,
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
  import { showMessageDialog } from '$lib/components/message-dialog.svelte';
  import { baseHeaderClasses, headerDividerClasses } from '$lib/css-classes';
  import { deviceEnvironment } from '$lib/data/device-environment.svelte';
  import { appName } from '$lib/data/env';
  import { viewMode$ } from '$lib/data/store';
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

  let paginatedReadingPositionMenuItems = $derived([
    { label: 'Set current reading position', onclick: onsetCustomReadingPoint },
    ...(hasCustomReadingPoint
      ? [
          { label: 'Show current reading position', onclick: onshowCustomReadingPoint },
          { label: 'Clear current reading position', onclick: onresetCustomReadingPoint }
        ]
      : []),
    {
      label: 'About reading position…',
      separatorBefore: true,
      onclick: showPaginatedReadingPositionHelp
    }
  ]);
  let scrollReadingMarkerMenuItems = $derived([
    { label: 'Move reading marker', onclick: onsetCustomReadingPoint },
    ...(hasCustomReadingPoint
      ? [
          { label: 'Show reading marker', onclick: onshowCustomReadingPoint },
          { label: 'Reset reading marker', onclick: onresetCustomReadingPoint }
        ]
      : []),
    {
      label: 'About reading marker…',
      separatorBefore: true,
      onclick: showScrollReadingMarkerHelp
    }
  ]);
  let readingLocationMenu = $derived.by(() => {
    if ($viewMode$ === ViewMode.Paginated) {
      return {
        faIcon: faCrosshairs,
        label: 'Position',
        title: 'Open current reading position actions',
        items: paginatedReadingPositionMenuItems
      };
    }

    return {
      faIcon: faEye,
      label: 'Marker',
      title: 'Open reading marker actions',
      items: scrollReadingMarkerMenuItems
    };
  });
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
  let mobileMenuItems = $derived([...secondaryActions, ...readingLocationMenu.items]);

  function showPaginatedReadingPositionHelp() {
    return showMessageDialog({
      title: 'Current reading position',
      message: `In paginated mode, ${appName} normally estimates your position to be the start of the visible page. Set the current position to identify the exact paragraph you are reading.\n\nThis position is used to calculate progress, characters read, and bookmarks saved on this page. It is cleared when you turn the page.`
    });
  }

  function showScrollReadingMarkerHelp() {
    return showMessageDialog({
      title: 'Reading marker',
      message: `The reading marker represents where your eyes normally rest on the screen. By default, it is at the top edge of the reading area for horizontal text and the right edge for vertical text.\n\nIn scroll mode, as text passes this fixed point, ${appName} updates your progress, characters read, and bookmark position. The marker stays at the same relative screen position across books and screen sizes.`
    });
  }
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
    <HeaderMenuButton {...readingLocationMenu} />
    <div class={headerDividerClasses}></div>
    <HeaderNavTabs />
  </div>
</div>
