<script lang="ts">
  import { untrack } from 'svelte';

  interface Props {
    html: string;
    onload?: () => void;
  }

  let { html, onload }: Props = $props();

  $effect(() => {
    html;
    untrack(() => onload?.());
  });
</script>

{@html html}
