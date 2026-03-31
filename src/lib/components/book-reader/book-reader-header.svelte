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
  import HeaderIconButton from '$lib/components/header-icon-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import {
    baseHeaderClasses,
    headerDividerClasses,
    labelIconClasses,
    nTranslateXHeaderFa,
    translateXHeaderFa
  } from '$lib/css-classes';
  import { customReadingPointEnabled$, viewMode$ } from '$lib/data/store';
  import { ViewMode } from '$lib/data/view-mode';
  import { dummyFn, isMobile$ } from '$lib/functions/utils';
  import { createEventDispatcher } from 'svelte';
  import Fa from 'svelte-fa';

  export let hasChapterData: boolean;
  export let hasText: boolean;
  export let autoScrollMultiplier: number;
  export let hasCustomReadingPoint: boolean;
  export let showFullscreenButton: boolean;
  export let isBookmarkScreen: boolean;
  export let hasBookmarkData: boolean;

  const dispatch = createEventDispatcher<{
    tocClick: void;
    bookmarkClick: void;
    scrollToBookmarkClick: void;
    jumpClick: void;
    completeBook: void;
    fullscreenClick: void;
    showCustomReadingPoint: void;
    setCustomReadingPoint: void;
    resetCustomReadingPoint: void;
    statisticsClick: void;
    readerImageGalleryClick: void;
    settingsClick: void;
    bookManagerClick: void;
  }>();

  const customReadingPointMenuItems: {
    label: string;
    action: any;
  }[] = [
    ...(hasCustomReadingPoint ? [{ label: 'Show Point', action: 'showCustomReadingPoint' }] : []),
    { label: 'Set Point', action: 'setCustomReadingPoint' },
    ...(hasCustomReadingPoint ? [{ label: 'Reset Point', action: 'resetCustomReadingPoint' }] : [])
  ];

  let customReadingPointMenuElm: Popover;

  function dispatchCustomReadingPointAction(action: any) {
    dispatch(action);
    customReadingPointMenuElm.toggleOpen();
  }
</script>

<div class="flex justify-between bg-gray-700 px-4 md:px-8 {baseHeaderClasses}">
  <div class="flex transform-gpu {nTranslateXHeaderFa}">
    {#if hasChapterData}
      <HeaderIconButton
        icon={faList}
        title="Open Table of Contents"
        label="TOC"
        on:click={() => dispatch('tocClick')}
      />
    {/if}
    <HeaderIconButton
      icon={isBookmarkScreen ? fasBookmark : farBookmark}
      title="Create Bookmark"
      label="Bookmark"
      on:click={() => dispatch('bookmarkClick')}
    />
    {#if hasBookmarkData}
      <HeaderIconButton
        icon={faRotateLeft}
        title="Return to Bookmark"
        label="Return to Bookmark"
        on:click={() => dispatch('scrollToBookmarkClick')}
      />
    {/if}
    {#if $viewMode$ === ViewMode.Continuous && !$isMobile$}
      <div
        class="flex items-center px-4 text-xl xl:px-3 xl:text-lg"
        title="Current Autoscroll Speed"
      >
        {autoScrollMultiplier}x
      </div>
    {/if}
    <HeaderIconButton
      icon={faFlag}
      title="Complete Book"
      label="Complete Book"
      on:click={() => dispatch('completeBook')}
    />
    {#if showFullscreenButton}
      <HeaderIconButton
        icon={faExpand}
        title="Toggle Fullscreen"
        label="Fullscreen"
        on:click={() => dispatch('fullscreenClick')}
      />
    {/if}
    {#if hasText}
      <HeaderIconButton
        icon={faHashtag}
        title="Jump to Position"
        label="Jump"
        on:click={() => dispatch('jumpClick')}
      />
    {/if}
    {#if $readerImageGalleryPictures$.length}
      <HeaderIconButton
        icon={faImages}
        title="Open Image Gallery"
        label="Images"
        on:click={() => dispatch('readerImageGalleryClick')}
      />
    {/if}
  </div>

  <div class="flex transform-gpu {translateXHeaderFa}">
    {#if $customReadingPointEnabled$ || $viewMode$ === ViewMode.Paginated}
      <div class="flex">
        <Popover
          placement="bottom"
          fallbackPlacements={['bottom-end', 'bottom-start']}
          yOffset={0}
          bind:this={customReadingPointMenuElm}
        >
          <div slot="icon" title="Open Custom Point Actions" class={labelIconClasses}>
            <Fa icon={faCrosshairs} class="text-sm xl:text-xs" />
            <span>Point&nbsp;▾</span>
          </div>
          <div class="w-40 bg-gray-700 md:w-32" slot="content">
            {#each customReadingPointMenuItems as actionItem (actionItem.label)}
              <div
                tabindex="0"
                role="button"
                class="px-4 py-2 text-sm hover:bg-white hover:text-gray-700"
                on:click={() => dispatchCustomReadingPointAction(actionItem.action)}
                on:keyup={dummyFn}
              >
                {actionItem.label}
              </div>
            {/each}
          </div>
        </Popover>
      </div>
      <div class={headerDividerClasses}></div>
    {/if}
    <HeaderNavTabs
      disableNavigation
      on:navigate={({ detail }) => {
        if (detail === '/statistics') dispatch('statisticsClick');
        else if (detail === '/settings') dispatch('settingsClick');
        else if (detail === '/manage') dispatch('bookManagerClick');
      }}
    />
  </div>
</div>
