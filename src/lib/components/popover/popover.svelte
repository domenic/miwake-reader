<script lang="ts">
  import type { Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { popovers } from '$lib/components/popover/popover';
  import { CLOSE_POPOVER } from '$lib/data/events';
  import { clickOutside } from '$lib/functions/use-click-outside';
  import type { Instance, Placement } from '@popperjs/core';
  import flip from '@popperjs/core/lib/modifiers/flip';
  import offset from '@popperjs/core/lib/modifiers/offset';
  import { createPopper } from '@popperjs/core/lib/popper-lite';
  import { tick } from 'svelte';

  interface Props {
    contentText?: string;
    containerStyles?: string;
    innerContainerStyles?: string;
    contentStyles?: string;
    eventType?: string;
    fallbackPlacements?: string[];
    placement?: Placement;
    singlePopover?: boolean;
    xOffset?: number;
    yOffset?: number;
    onopen?: () => void;
    children?: Snippet;
    icon?: Snippet;
    content?: Snippet;
  }

  let {
    contentText = '',
    containerStyles = '',
    innerContainerStyles = '',
    contentStyles = 'padding: 0',
    eventType = 'click',
    fallbackPlacements = ['left', 'bottom', 'right'],
    placement = 'top',
    singlePopover = true,
    xOffset = 0,
    yOffset = 10,
    onopen,
    children,
    icon: iconSnippet,
    content: contentSnippet
  }: Props = $props();

  let contentElement = $state<HTMLElement>();
  let iconElement = $state<HTMLElement>();
  let popoverElement = $state<HTMLElement>();

  let id: symbol;
  let instance: Instance;
  let isOpen = $state(false);

  $effect(() => {
    if (browser) {
      id = Symbol('popover');
    }
  });

  $effect(() => {
    if (isOpen && singlePopover && !$popovers.includes(id)) {
      isOpen = false;
    }
  });

  export async function toggleOpen(referenceElement?: HTMLElement | Event) {
    if (isOpen) {
      popovers.remove(id);
    } else if (singlePopover) {
      popovers.replace(id);
    } else {
      popovers.add(id);
    }

    isOpen = !isOpen;
    await tick();

    const targetElement = getTargetElement(referenceElement);
    const popperElement = popoverElement;

    if (!isOpen || !targetElement || !popperElement) {
      return;
    }

    if (instance) {
      instance.state.elements.reference = targetElement;
      instance.state.elements.popper = popperElement;
      await instance.update().catch(() => {
        // no-op
      });
      await tick();
      onopen?.();
    } else {
      instance = createPopper(targetElement, popperElement, {
        placement,
        modifiers: [
          flip,
          {
            name: 'flip',
            options: {
              fallbackPlacements
            }
          },
          offset,
          {
            name: 'offset',
            options: {
              offset: [xOffset, yOffset]
            }
          }
        ]
      });

      await tick();
      onopen?.();
    }
  }

  function conditionalClickHandlerAndClass(node: HTMLElement, conditionFulfilled: boolean) {
    if (conditionFulfilled) {
      node.classList.add('cursor-pointer');
      if (eventType === 'click') {
        node.addEventListener('click', toggleOpen, false);
      } else {
        node.addEventListener('pointerenter', toggleOpen, false);
        node.addEventListener('pointerleave', toggleOpen, false);
      }
    } else {
      node.classList.remove('cursor-pointer');
      if (eventType === 'click') {
        node.removeEventListener('click', toggleOpen, false);
      } else {
        node.removeEventListener('pointerenter', toggleOpen, false);
        node.removeEventListener('pointerleave', toggleOpen, false);
      }
    }

    return {
      destroy() {
        if (eventType === 'click') {
          node.removeEventListener('click', toggleOpen, false);
        } else {
          node.removeEventListener('pointerenter', toggleOpen, false);
          node.removeEventListener('pointerleave', toggleOpen, false);
        }
      }
    };
  }

  function externalClose(node: HTMLElement) {
    node.addEventListener(CLOSE_POPOVER, toggleOpen, false);

    return {
      destroy() {
        node.removeEventListener(CLOSE_POPOVER, toggleOpen, false);
      }
    };
  }

  function getTargetElement(referenceElement?: HTMLElement | Event): HTMLElement | undefined {
    let targetElement: HTMLElement | undefined;

    if (referenceElement instanceof HTMLElement) {
      targetElement = referenceElement;
    } else {
      targetElement = iconSnippet ? iconElement : contentElement;
    }

    return targetElement;
  }
</script>

<div data-popover class="flex items-center" style={containerStyles}>
  <div
    style={innerContainerStyles}
    use:conditionalClickHandlerAndClass={!iconSnippet}
    bind:this={contentElement}
  >
    {@render children?.()}
  </div>
  <div use:conditionalClickHandlerAndClass={!!iconSnippet} bind:this={iconElement}>
    {@render iconSnippet?.()}
  </div>
</div>

{#if isOpen}
  <div
    data-popover
    class="max-w-60vw absolute z-10 rounded bg-[#333] text-sm font-bold text-white md:max-w-lg"
    class:whitespace-pre-wrap={contentText}
    bind:this={popoverElement}
  >
    <div
      style={contentStyles}
      use:externalClose
      use:clickOutside={({ target }) => {
        if (!(target instanceof Element && target.closest('[data-popover]'))) {
          toggleOpen();
        }
      }}
    >
      {contentText}
      {@render contentSnippet?.()}
    </div>
  </div>
{/if}
