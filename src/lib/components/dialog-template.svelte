<script lang="ts">
  import type { Snippet } from 'svelte';
  import { dialogSurfaceClasses, dialogTitleClasses } from '$lib/css-classes';

  interface Props {
    header?: Snippet;
    content?: Snippet;
    footer?: Snippet;
  }

  let { header, content, footer }: Props = $props();
</script>

<section class={dialogSurfaceClasses}>
  <h2 class={dialogTitleClasses}>{@render header?.()}</h2>
  {@render content?.()}
  <footer class="flex flex-wrap items-center justify-end pt-5">
    {@render footer?.()}
  </footer>
</section>
