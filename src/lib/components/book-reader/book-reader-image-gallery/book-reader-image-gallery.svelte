<script lang="ts">
  import { faChevronLeft, faChevronRight, faXmark } from '@fortawesome/free-solid-svg-icons';
  import { handleImageGalleryKeydown } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery-keybind';
  import { readerImageGallery } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery-state.svelte';
  import { appShortcuts } from '$lib/data/app-shortcuts.svelte';
  import { BlurMode } from '$lib/data/blur-mode';
  import { blurImageMode$ } from '$lib/data/store';
  import { onMount } from 'svelte';
  import { quintInOut } from 'svelte/easing';
  import { MediaQuery } from 'svelte/reactivity';
  import Fa from 'svelte-fa';
  import { fly } from 'svelte/transition';

  interface Props {
    fontColor: string;
    backgroundColor: string;
    onclose?: () => void;
  }

  let { fontColor, backgroundColor, onclose }: Props = $props();

  let contentContainer: HTMLElement = $state(undefined as any);
  let imageContainer: HTMLElement = $state(undefined as any);
  const galleryPreviewVisible = new MediaQuery('min-width: 1024px');
  let selectedImageIndex = $state(galleryPreviewVisible.current ? 0 : -1);

  let selectedImage = $derived(readerImageGallery.pictures[selectedImageIndex]);

  $effect(() => {
    if (imageContainer && selectedImage) {
      imageContainer.focus();
    }
  });

  onMount(() => {
    const restoreAppShortcuts = appShortcuts.disable();

    const handleWheel = (ev: WheelEvent) => {
      onWheel(ev);
    };

    window.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      restoreAppShortcuts();
      window.removeEventListener('wheel', handleWheel);
    };
  });

  function onKeydown(ev: KeyboardEvent) {
    // The gallery is the active shortcut surface while open; it disables background reader
    // shortcuts, not its own Escape/arrow handling.
    handleImageGalleryKeydown(ev, {
      close: closeReaderImageGallery,
      nextImage,
      previousImage
    });
  }

  function onWheel(ev: WheelEvent) {
    if (document.activeElement !== imageContainer) {
      return;
    }

    if (ev.deltaY < 0) {
      previousImage();
    } else {
      nextImage();
    }

    ev.preventDefault();
  }

  function closeReaderImageGallery() {
    onclose?.();
  }

  function previousImage() {
    if (selectedImageIndex <= 0) {
      return;
    }

    updateImage(-1);
  }

  function nextImage() {
    if (
      selectedImageIndex === -1 ||
      selectedImageIndex === readerImageGallery.pictures.length - 1
    ) {
      return;
    }

    updateImage(1);
  }

  function updateImage(indexMod: number) {
    selectedImageIndex += indexMod;

    const elm = contentContainer.querySelector(`button[data-image-index="${selectedImageIndex}"]`);

    if (elm instanceof HTMLElement) {
      const absoluteElementTop = elm.offsetTop + elm.clientHeight / 2;
      const middle = absoluteElementTop - contentContainer.clientHeight / 2;

      contentContainer.scrollTo(0, middle);
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />
<div class="flex size-full writing-horizontal-tb fixed top-0 left-0 z-60" style:color={fontColor}>
  <div
    tabindex="-1"
    class="flex-1 flex-col justify-between overflow-auto lg:max-w-md"
    style:background-color={backgroundColor}
    in:fly|local={{ x: -100, duration: 100, easing: quintInOut }}
    bind:this={contentContainer}
  >
    <div
      class="sticky top-0 flex justify-between p-2 z-10"
      style:background-color={backgroundColor}
    >
      <button
        title="Close image gallery"
        class="flex items-end md:items-center"
        onclick={closeReaderImageGallery}
      >
        <Fa icon={faXmark} />
      </button>
    </div>
    <div class="flex flex-col overflow-auto p-2">
      {#each readerImageGallery.pictures as readerImageGalleryPicture, urlIndex (readerImageGalleryPicture.url)}
        {@const showSpoiler =
          $blurImageMode$ !== BlurMode.OFF && !readerImageGalleryPicture.unspoilered}
        <div class="relative my-4 flex justify-center" class:spoiler={showSpoiler}>
          <button
            class="flex justify-center"
            data-image-index={urlIndex}
            title="Preview image"
            aria-label={`Preview image ${urlIndex + 1}`}
            onclick={() => {
              if (galleryPreviewVisible.current) {
                selectedImageIndex = urlIndex;
              }
            }}
          >
            <img
              src={readerImageGalleryPicture.url}
              alt={`Gallery image ${urlIndex + 1}`}
              class="max-h-96 lg:max-h-64"
            />
          </button>
          {#if showSpoiler}
            <button
              title="Show image"
              aria-label={`Reveal gallery image ${urlIndex + 1}`}
              class="spoiler-label"
              onclick={() => readerImageGallery.togglePictureSpoiler(readerImageGalleryPicture.url)}
            >
              <span lang="ja">ネタバレ</span>
            </button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
  <div
    tabindex="-1"
    class="invisible tap-highlight-transparent bg-black/85 lg:visible lg:flex lg:flex-1 lg:flex-col"
    bind:this={imageContainer}
  >
    {#if selectedImage}
      {@const showSpoiler = $blurImageMode$ !== BlurMode.OFF && !selectedImage.unspoilered}
      <div class="flex flex-1">
        <button
          title="Previous image"
          class="mx-4 text-5xl hover:text-red-500"
          class:invisible={!selectedImageIndex}
          onclick={previousImage}
        >
          <Fa icon={faChevronLeft} />
        </button>
        <div class="flex justify-center items-center flex-1" class:spoiler={showSpoiler}>
          <img class="max-h-[94vh]" src={selectedImage.url} alt="currentImage" />
          {#if showSpoiler}
            <button
              title="Show image"
              class="spoiler-label"
              aria-label={`Reveal gallery image ${selectedImageIndex + 1}`}
              onclick={() => readerImageGallery.togglePictureSpoiler(selectedImage.url)}
            >
              <span lang="ja">ネタバレ</span>
            </button>
          {/if}
        </div>
        <button
          title="Next image"
          class="mx-4 text-5xl hover:text-red-500"
          class:invisible={selectedImageIndex === readerImageGallery.pictures.length - 1}
          onclick={nextImage}
        >
          <Fa icon={faChevronRight} />
        </button>
      </div>
      <div class="pb-2 text-center text-white">
        {selectedImageIndex + 1} / {readerImageGallery.pictures.length}
      </div>
    {/if}
  </div>
</div>

<style>
  .spoiler {
    overflow: hidden;
    position: relative;
  }

  .spoiler .spoiler-label {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    color: #dcddde;
    background-color: rgba(0, 0, 0, 0.6);
    display: inline-block;
    padding: 12px 8px;
    border-radius: 20px;
    font-size: 15px;
    font-family: 'Noto Sans JP', sans-serif;
    text-transform: uppercase;
    font-weight: 700;
    cursor: pointer;
  }

  .spoiler .spoiler-label:hover {
    color: #ffffff;
    background-color: rgba(0, 0, 0, 0.9);
  }

  .spoiler img {
    filter: blur(44px);
  }
</style>
