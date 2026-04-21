<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    main: Snippet;
    actions?: Snippet;
  }

  let { main, actions }: Props = $props();
</script>

<div class="flex items-start justify-between gap-4 border-t border-black/10 px-5 py-4">
  <div class="min-w-0 flex-1">
    {@render main()}
  </div>
  {#if actions}
    <div class="flex shrink-0 gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
