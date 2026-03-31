<script lang="ts">
  import type { MouseEventHandler, KeyboardEventHandler } from 'svelte/elements';
  import { faImage } from '@fortawesome/free-regular-svg-icons';
  import { onDestroy } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    imagePath: string | Blob;
    title: string;
    progress: number;
    onclick?: MouseEventHandler<HTMLDivElement>;
    onkeyup?: KeyboardEventHandler<HTMLDivElement>;
  }

  let { imagePath, title, progress, onclick, onkeyup }: Props = $props();

  let objectUrl = '';

  onDestroy(() => {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
  });

  function convertImagePath(value: string | Blob) {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = '';
    }
    if (typeof value !== 'string') {
      objectUrl = URL.createObjectURL(
        value.type ? value : new Blob([value], { type: 'image/jpeg' })
      );

      return objectUrl;
    }

    return value;
  }

  function mapImagePathFactory() {
    let prevValue: string | Blob | undefined;
    let prevResponse: string | undefined;

    const isEqual = (newValue: string | Blob) => {
      if (!prevValue) return false;
      if (prevValue instanceof Blob && newValue instanceof Blob) {
        return prevValue.type === newValue.type && prevValue.size === newValue.size;
      }
      if (typeof prevValue !== 'object' || typeof newValue !== 'object') {
        return prevValue === newValue;
      }
      return false;
    };

    return (value: string | Blob) => {
      if (isEqual(value)) return prevResponse as string;

      prevValue = value;
      prevResponse = convertImagePath(value);

      return prevResponse;
    };
  }

  const mapImagePath = mapImagePathFactory();

  let imageLoading = $state(true);

  let alt = $derived(`${title}_cover`);
</script>

<div tabindex="0" role="button" class="aspect-w-2 aspect-h-3 relative" {onclick} {onkeyup}>
  <div class="inline">
    <div class="h-full w-full text-5xl sm:text-7xl">
      {#if imageLoading}
        <Fa class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" icon={faImage} />
      {/if}

      {#if imagePath}
        <img
          decoding="async"
          loading="lazy"
          referrerpolicy="no-referrer"
          class="book-cover relative h-full w-full object-cover transition delay-150 duration-700 ease-out"
          class:blur={imageLoading}
          src={mapImagePath(imagePath)}
          {alt}
          onload={() => (imageLoading = false)}
          onerror={() => (imageLoading = false)}
        />
      {/if}
    </div>

    <div class="absolute inset-x-0 bottom-0">
      <div
        class="sm:h-21 h-16 bg-gray-800 bg-opacity-80 p-0.5 px-1.5 text-justify text-sm text-white sm:p-1.5 sm:text-base"
      >
        <span class="line-clamp-3">{title}</span>
      </div>
      <div class="h-2.5 bg-gray-400 bg-opacity-80">
        <div
          class="h-full rounded bg-gradient-to-b from-red-600 to-red-900"
          style:width="{progress * 100}%"
        ></div>
      </div>
    </div>
  </div>
</div>
