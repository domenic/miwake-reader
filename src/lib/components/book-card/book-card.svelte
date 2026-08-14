<script lang="ts">
  import { faImage } from '@fortawesome/free-regular-svg-icons';
  import { onDestroy } from 'svelte';
  import Fa from 'svelte-fa';
  import { displayTitle } from '$lib/functions/book-title';
  import { japaneseLangIfNeeded } from '$lib/functions/japanese-language';

  interface Props {
    imagePath: string | Blob;
    title: string;
    author?: string;
    progress: number;
    completed: boolean;
    current?: boolean;
    isPlaceholder?: boolean;
    selected?: boolean;
  }

  let {
    imagePath,
    title,
    author,
    progress,
    completed,
    current = false,
    isPlaceholder = false,
    selected = false
  }: Props = $props();

  let objectURL = '';

  onDestroy(() => {
    if (objectURL) {
      URL.revokeObjectURL(objectURL);
    }
  });

  function convertImagePath(value: string | Blob) {
    if (objectURL) {
      URL.revokeObjectURL(objectURL);
      objectURL = '';
    }
    if (typeof value !== 'string') {
      objectURL = URL.createObjectURL(value);

      return objectURL;
    }

    return value;
  }

  function mapImagePathFactory() {
    let previousValue: string | Blob | undefined;
    let previousResponse: string | undefined;

    return (value: string | Blob) => {
      if (value === previousValue) return previousResponse as string;

      previousValue = value;
      previousResponse = convertImagePath(value);

      return previousResponse;
    };
  }

  const mapImagePath = mapImagePathFactory();

  let imageLoading = $state(true);
  let displayedTitle = $derived(displayTitle(title));
  let titleLanguage = $derived(japaneseLangIfNeeded(displayedTitle));
  let authorLanguage = $derived(author ? japaneseLangIfNeeded(author) : undefined);
  let progressPercentage = $derived(completed ? 100 : Math.round(progress * 100));
</script>

<span
  class="mdc-elevation--z1 hover:mdc-elevation--z8 group-hover:mdc-elevation--z8 mdc-elevation-transition relative block aspect-2/3 w-full overflow-hidden text-5xl sm:text-7xl"
  class:rounded-tl-xl={current}
  class:mdc-elevation--z4={selected || current}
  class:opacity-60={isPlaceholder}
>
  {#if imageLoading}
    <Fa class="absolute top-1/2 left-1/2 -translate-1/2" icon={faImage} />
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

  <progress
    class="reading-progress"
    class:completed
    aria-label={`Reading progress for ${displayedTitle}`}
    value={progressPercentage}
    max="100"
  ></progress>
</span>

<span
  class="mt-3 grid h-14.5 min-w-0 grid-cols-[minmax(0,1fr)_2rem] items-start gap-2 overflow-hidden"
>
  <span class="min-w-0">
    <span class="line-clamp-2 text-sm font-medium" lang={titleLanguage}>{displayedTitle}</span>
    <span class="mt-0.5 block truncate text-xs text-gray-500" lang={authorLanguage}>
      {author}
    </span>
  </span>
  <span
    class="pt-0.5 text-right text-xs font-medium tabular-nums"
    class:text-emerald-700={completed}
    class:text-blue-700={!completed}
  >
    {progressPercentage}%
  </span>
</span>

<style>
  .reading-progress {
    --progress-from: var(--color-blue-500);
    --progress-to: var(--color-blue-700);

    position: absolute;
    inset-inline: 0;
    bottom: 0;
    display: block;
    width: 100%;
    height: 0.625rem;
    appearance: none;
    border: 0;
    background: color-mix(in oklab, var(--color-gray-400) 80%, transparent);
    pointer-events: none;

    &.completed {
      --progress-from: var(--color-emerald-500);
      --progress-to: var(--color-emerald-600);
    }

    &::-webkit-progress-bar {
      background: color-mix(in oklab, var(--color-gray-400) 80%, transparent);
    }

    &::-webkit-progress-value {
      background: linear-gradient(to bottom, var(--progress-from), var(--progress-to));
    }

    &::-moz-progress-bar {
      background: linear-gradient(to bottom, var(--progress-from), var(--progress-to));
    }
  }
</style>
