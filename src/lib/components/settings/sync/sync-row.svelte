<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    main: Snippet;
    actions?: Snippet;
    /** When true, don't draw a border above this row (first row in a group). */
    first?: boolean;
  }

  let { main, actions, first = false }: Props = $props();
</script>

<div
  class="flex items-start justify-between gap-4 py-3"
  class:border-t={!first}
  class:border-gray-400={!first}
  class:border-opacity-40={!first}
>
  <div class="min-w-0 flex-1">
    {@render main()}
  </div>
  {#if actions}
    <div class="flex shrink-0 gap-2">
      {@render actions()}
    </div>
  {/if}
</div>
