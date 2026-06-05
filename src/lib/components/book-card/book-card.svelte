<script lang="ts">
  import type { MouseEventHandler, KeyboardEventHandler } from 'svelte/elements';
  import { faImage } from '@fortawesome/free-regular-svg-icons';
  import { onDestroy } from 'svelte';
  import Fa from 'svelte-fa';
  import { japaneseLangIfNeeded } from '$lib/functions/japanese-language';

  interface Props {
    imagePath: string | Blob;
    title: string;
    progress: number;
    completed: boolean;
    onclick?: MouseEventHandler<HTMLDivElement>;
    onkeyup?: KeyboardEventHandler<HTMLDivElement>;
  }

  let { imagePath, title, progress, completed, onclick, onkeyup }: Props = $props();

  const componentId = $props.id();

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
      objectUrl = URL.createObjectURL(value);

      return objectUrl;
    }

    return value;
  }

  function mapImagePathFactory() {
    let prevValue: string | Blob | undefined;
    let prevResponse: string | undefined;

    return (value: string | Blob) => {
      if (value === prevValue) return prevResponse as string;

      prevValue = value;
      prevResponse = convertImagePath(value);

      return prevResponse;
    };
  }

  const mapImagePath = mapImagePathFactory();

  let imageLoading = $state(true);

  let titleId = $derived(`${componentId}-title`);
  let titleLang = $derived(japaneseLangIfNeeded(title));
  let progressLabelId = $derived(`${componentId}-progress-label`);
  let progressPercentage = $derived(completed ? 100 : Math.round(progress * 100));
  let progressValueClasses = $derived(
    completed
      ? '[&::-webkit-progress-value]:rounded-none [&::-webkit-progress-value]:from-emerald-500 [&::-webkit-progress-value]:to-emerald-600 [&::-moz-progress-bar]:rounded-none [&::-moz-progress-bar]:from-emerald-500 [&::-moz-progress-bar]:to-emerald-600'
      : '[&::-webkit-progress-value]:rounded-r-sm [&::-webkit-progress-value]:from-blue-500 [&::-webkit-progress-value]:to-blue-700 [&::-moz-progress-bar]:rounded-r-sm [&::-moz-progress-bar]:from-blue-500 [&::-moz-progress-bar]:to-blue-700'
  );
</script>

<div tabindex="0" role="button" class="relative aspect-2/3" {onclick} {onkeyup}>
  <div class="inline">
    <div class="size-full text-5xl sm:text-7xl">
      {#if imageLoading}
        <Fa class="absolute top-1/2 left-1/2 -translate-1/2 " icon={faImage} />
      {/if}

      {#if imagePath}
        <img
          decoding="async"
          loading="lazy"
          referrerpolicy="no-referrer"
          class="book-cover relative size-full object-cover transition delay-150 duration-700 ease-out"
          class:blur={imageLoading}
          src={mapImagePath(imagePath)}
          alt=""
          onload={() => (imageLoading = false)}
          onerror={() => (imageLoading = false)}
        />
      {/if}
    </div>

    <div class="absolute inset-x-0 bottom-0">
      <div
        class="sm:h-21 h-16 bg-gray-800/80 p-0.5 px-1.5 text-justify text-sm text-white sm:p-1.5 sm:text-base"
      >
        <span id={titleId} class="line-clamp-3" lang={titleLang}>{title}</span>
      </div>
      <span id={progressLabelId} class="sr-only">Reading progress</span>
      <progress
        class={`block h-2.5 w-full appearance-none border-0 bg-gray-400/80 [&::-webkit-progress-bar]:bg-gray-400/80 [&::-webkit-progress-value]:bg-linear-to-b [&::-moz-progress-bar]:bg-linear-to-b ${progressValueClasses}`}
        aria-labelledby={`${titleId} ${progressLabelId}`}
        value={progressPercentage}
        max="100"
      ></progress>
    </div>
  </div>
</div>
