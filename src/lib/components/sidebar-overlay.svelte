<script module lang="ts">
  let openOverlayCount = 0;
  let skipKeyDownBeforeOverlay = false;
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { skipKeyDownListener$ } from '$lib/data/store';
  import { onDestroy } from 'svelte';

  interface Props {
    open: boolean;
    side?: 'left' | 'right';
    class?: string;
    style?: string;
    children?: Snippet;
  }

  let {
    open = $bindable(),
    side = 'right',
    class: className = '',
    style,
    children
  }: Props = $props();

  let dialogElement = $state<HTMLDialogElement>();
  let wasOpen = $state(false);

  function startSkipKeyDownListener() {
    if (openOverlayCount === 0) {
      skipKeyDownBeforeOverlay = skipKeyDownListener$.getValue();
    }

    openOverlayCount += 1;
    skipKeyDownListener$.next(true);
  }

  function stopSkipKeyDownListener() {
    if (openOverlayCount === 0) {
      return;
    }

    openOverlayCount -= 1;

    if (openOverlayCount === 0) {
      skipKeyDownListener$.next(skipKeyDownBeforeOverlay);
    }
  }

  $effect(() => {
    if (!browser || !dialogElement) {
      return;
    }

    if (open === dialogElement.open) {
      return;
    }

    if (open) {
      dialogElement.showModal();
    } else {
      dialogElement.close();
    }
  });

  $effect(() => {
    if (!browser) {
      return;
    }

    if (open && !wasOpen) {
      startSkipKeyDownListener();
    } else if (!open && wasOpen) {
      stopSkipKeyDownListener();
    }

    wasOpen = open;
  });

  onDestroy(() => {
    if (wasOpen) {
      stopSkipKeyDownListener();
    }
  });
</script>

<dialog
  bind:this={dialogElement}
  class="sidebar-overlay writing-horizontal-tb m-0 h-full w-full max-h-none max-w-xl border-none p-0 {className}"
  data-side={side}
  closedby="any"
  {style}
  onclose={() => (open = false)}
>
  {@render children?.()}
</dialog>

<style>
  .sidebar-overlay {
    flex-direction: column;
    justify-content: space-between;
    transition:
      translate var(--default-transition-duration) var(--default-transition-timing-function),
      display var(--default-transition-duration) var(--default-transition-timing-function)
        allow-discrete,
      overlay var(--default-transition-duration) var(--default-transition-timing-function)
        allow-discrete;
  }

  .sidebar-overlay[data-side='left'] {
    inset: 0 auto 0 0;
    translate: -100% 0;
  }

  .sidebar-overlay[data-side='right'] {
    inset: 0 0 0 auto;
    translate: 100% 0;
  }

  .sidebar-overlay::backdrop {
    background: rgb(0 0 0 / 0);
    transition:
      background-color var(--default-transition-duration) var(--default-transition-timing-function),
      display var(--default-transition-duration) var(--default-transition-timing-function)
        allow-discrete,
      overlay var(--default-transition-duration) var(--default-transition-timing-function)
        allow-discrete;
  }

  .sidebar-overlay[open] {
    display: flex;
    translate: 0 0;
  }

  .sidebar-overlay[open]::backdrop {
    background: rgb(0 0 0 / 0.32);
  }

  @starting-style {
    .sidebar-overlay[open][data-side='left'] {
      translate: -100% 0;
    }
    .sidebar-overlay[open][data-side='right'] {
      translate: 100% 0;
    }

    .sidebar-overlay[open]::backdrop {
      background: rgb(0 0 0 / 0);
    }
  }
</style>
