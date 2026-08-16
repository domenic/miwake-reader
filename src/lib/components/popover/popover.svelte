<script lang="ts">
  import type { Snippet } from 'svelte';
  import { browser } from '$app/environment';
  import { popovers } from '$lib/components/popover/popover';
  import { clickOutside } from '$lib/functions/use-click-outside';
  import type { Instance, Placement } from '@popperjs/core';
  import flip from '@popperjs/core/lib/modifiers/flip';
  import offset from '@popperjs/core/lib/modifiers/offset';
  import preventOverflow from '@popperjs/core/lib/modifiers/preventOverflow';
  import { createPopper } from '@popperjs/core/lib/popper-lite';
  import { tick } from 'svelte';

  interface Props {
    contentText?: string;
    containerStyles?: string;
    innerContainerStyles?: string;
    innerContainerClasses?: string;
    contentStyles?: string;
    eventType?: string;
    fallbackPlacements?: string[];
    placement?: Placement;
    /**
     * Popper positioning strategy. Use `'fixed'` when the trigger
     * lives inside a `position: fixed`/`absolute` ancestor — the
     * popover then uses the viewport as its containing block instead
     * of inheriting the (often narrow) positioned ancestor's box,
     * which would otherwise shrink-to-fit the popover and wrap its
     * content word-by-word.
     */
    strategy?: 'absolute' | 'fixed';
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
    innerContainerClasses = '',
    contentStyles = 'padding: 0',
    eventType = 'click',
    fallbackPlacements = ['left', 'bottom', 'right'],
    placement = 'top',
    strategy = 'absolute',
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
        strategy,
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
          },
          {
            ...preventOverflow,
            options: {
              padding: 8
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
    class={iconSnippet ? undefined : innerContainerClasses}
    style={iconSnippet ? undefined : innerContainerStyles}
    use:conditionalClickHandlerAndClass={!iconSnippet}
    bind:this={contentElement}
  >
    {@render children?.()}
  </div>
  <div
    class={iconSnippet ? innerContainerClasses : undefined}
    style={iconSnippet ? innerContainerStyles : undefined}
    use:conditionalClickHandlerAndClass={!!iconSnippet}
    bind:this={iconElement}
  >
    {@render iconSnippet?.()}
  </div>
</div>

{#if isOpen}
  <div
    data-popover
    class="popover-surface-dark p-0 font-bold"
    class:absolute={strategy === 'absolute'}
    class:fixed={strategy === 'fixed'}
    class:whitespace-pre-wrap={contentText}
    bind:this={popoverElement}
  >
    <div
      style={contentStyles}
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
