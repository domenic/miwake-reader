<!-- TODO: convert to a Svelte action (https://github.com/domenic/ebook-reader/issues/17) -->
<script lang="ts">
  import { quintOut } from 'svelte/easing';
  import { fade } from 'svelte/transition';

  let diameter = $state(0);
  let rippleLeft = $state(0);
  let rippleTop = $state(0);
  let ripples: { id: number }[] = $state([]);
  let hold = $state(false);
  let focus = $state(false);

  let containerEl = $state<HTMLElement>();

  let listeners: {
    el: HTMLElement;
    type: string;
    listener: (event: any) => void;
  }[] = [];

  let target = $derived(containerEl?.parentElement);

  $effect(() => {
    if (!target) return;

    target.classList.add('relative', 'overflow-hidden');
    const el = target;
    addListener(el, 'focusin', () => queueMicrotask(() => (focus = true)));
    addListener(el, 'focusout', () => queueMicrotask(() => (focus = false)));
    addListener(el, 'mouseenter', () => queueMicrotask(() => (focus = true)));
    addListener(el, 'mouseleave', () =>
      queueMicrotask(() => {
        hold = false;
        focus = false;
      })
    );
    addListener(el, 'mousedown', (ev) => queueMicrotask(() => createRippleFromMouseEvent(ev, el)));
    addListener(el, 'mouseup', () => queueMicrotask(() => (hold = false)));
    addListener(el, 'touchstart', (ev) => queueMicrotask(() => createRippleFromTouchEvent(ev, el)));
    addListener(el, 'touchend', () => queueMicrotask(() => (hold = false)));
    addListener(el, 'touchcancel', () => queueMicrotask(() => (hold = false)));

    return () => clearEventListeners();
  });

  function addListener<K extends keyof HTMLElementEventMap>(
    el: HTMLElement,
    type: K,
    listener: (event: HTMLElementEventMap[K]) => void
  ) {
    el.addEventListener(type, listener);
    listeners.push({ el, type, listener });
  }

  function clearEventListeners() {
    listeners.forEach(({ el, type, listener }) => el.removeEventListener(type, listener));
    listeners = [];
  }

  function createRipple(
    eventX: number,
    eventY: number,
    targetX: number,
    targetY: number,
    width: number,
    height: number
  ) {
    diameter = Math.max(width, height);
    const radius = diameter / 2;
    rippleLeft = eventX - targetX - radius;
    rippleTop = eventY - targetY - radius;
    ripples = [
      {
        id: Date.now()
      }
    ];
    hold = true;
    focus = false;
  }

  function createRippleFromMouseEvent(ev: MouseEvent, el: HTMLElement) {
    const rect = el.getBoundingClientRect();
    createRipple(ev.clientX, ev.clientY, rect.left, rect.top, rect.width, rect.height);
  }

  function createRippleFromTouchEvent(ev: TouchEvent, el: HTMLElement) {
    const touch = ev.touches[0];
    const rect = el.getBoundingClientRect();
    createRipple(touch.clientX, touch.clientY, rect.left, rect.top, rect.width, rect.height);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  function animateRipple(node: HTMLElement, params?: any) {
    return {
      delay: 0,
      duration: 400,
      css: (t: number, u: number) => `
          transform: scale(${t * 4});
          opacity: ${u}
        `
    };
  }
</script>

<span bind:this={containerEl} class="absolute inset-0 h-full w-full">
  {#each ripples as _ (_.id)}
    <span
      class="absolute rounded-full bg-gray-400/50"
      style:width="{diameter}px"
      style:height="{diameter}px"
      style:top="{rippleTop}px"
      style:left="{rippleLeft}px"
      in:animateRipple|local
      onintroend={() => queueMicrotask(() => (ripples = []))}
    ></span>
  {/each}
  {#if hold}
    <span
      class="absolute inset-0 h-full w-full bg-gray-400/25"
      transition:fade|local={{ easing: quintOut }}
    ></span>
  {/if}
  {#if hold || focus}
    <span
      class="absolute inset-0 h-full w-full bg-gray-400/[.10]"
      transition:fade|local={{ easing: quintOut }}
    ></span>
  {/if}
</span>
