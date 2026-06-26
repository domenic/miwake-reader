<script lang="ts">
  import type { Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import DialogFormButton from '$lib/components/dialog-form-button.svelte';
  import { appShortcuts } from '$lib/data/app-shortcuts.svelte';
  import { onDestroy } from 'svelte';

  interface Props {
    open: boolean;
    side?: 'left' | 'right';
    class?: string;
    closeTitle?: string;
    style?: string;
    onclose?: () => void;
    children?: Snippet;
  }

  let {
    open = $bindable(),
    side = 'right',
    class: className = '',
    closeTitle,
    style,
    onclose,
    children
  }: Props = $props();

  let dialogElement = $state<HTMLDialogElement>();
  let wasOpen = $state(false);
  let restoreAppShortcuts: (() => void) | undefined;
  const closeButtonClasses = $derived(
    `absolute top-4 z-10 flex items-center transition-colors hover:text-red-500 focus-visible:text-red-500 ${side === 'left' ? 'right-4' : 'left-4'}`
  );

  function disableAppShortcuts() {
    restoreAppShortcuts?.();
    restoreAppShortcuts = appShortcuts.disable();
  }

  function enableAppShortcuts() {
    restoreAppShortcuts?.();
    restoreAppShortcuts = undefined;
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
      disableAppShortcuts();
    } else if (!open && wasOpen) {
      enableAppShortcuts();
    }

    wasOpen = open;
  });

  onDestroy(() => {
    if (wasOpen) {
      enableAppShortcuts();
    }
  });
</script>

<dialog
  bind:this={dialogElement}
  class="sidebar-overlay writing-horizontal-tb m-0 size-full max-h-none max-w-xl border-none p-0 {className}"
  data-side={side}
  closedby="any"
  {style}
  onclose={() => {
    open = false;
    onclose?.();
  }}
>
  {#if closeTitle}
    <DialogFormButton title={closeTitle} class={closeButtonClasses} />
  {/if}

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
