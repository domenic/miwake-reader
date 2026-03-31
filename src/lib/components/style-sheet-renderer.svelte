<script lang="ts">
  import { onDestroy, onMount } from 'svelte';

  interface Props {
    styleSheet: string;
  }

  let { styleSheet }: Props = $props();

  let styleEl: HTMLStyleElement | undefined;

  $effect(() => {
    if (styleEl) {
      updateSheet(styleEl, styleSheet);
    }
  });

  function updateSheet(el: HTMLStyleElement, sheet: string) {
    const styleNode = document.createTextNode(sheet);
    if (el.firstChild) {
      el.replaceChild(styleNode, el.firstChild);
      return;
    }
    el.appendChild(styleNode);
  }

  onMount(() => {
    styleEl = document.createElement('style');
    document.head.appendChild(styleEl);
  });

  onDestroy(() => {
    if (styleEl) {
      document.head.removeChild(styleEl);
    }
  });
</script>
