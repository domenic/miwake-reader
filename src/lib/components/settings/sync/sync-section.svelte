<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description?: string;
    children?: Snippet;
  }

  let { title, description, children }: Props = $props();
</script>

<section class="mb-5 rounded-lg border border-black/10 bg-white">
  <header class="px-5 pt-5 pb-3">
    <h2 class="text-base font-medium text-black">{title}</h2>
    {#if description}
      <p class="mt-1 text-sm text-gray-600">{description}</p>
    {/if}
  </header>
  {@render children?.()}
</section>
