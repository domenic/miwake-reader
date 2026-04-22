<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    description?: string;
    children?: Snippet;
  }

  let { title, description, children }: Props = $props();
</script>

<section class="pb-8">
  <h2 class="mb-2 border-b border-black pb-1 text-xl font-medium capitalize">{title}</h2>
  {#if description}
    <p class="mb-4 text-sm text-gray-600">{description}</p>
  {/if}
  {@render children?.()}
</section>
