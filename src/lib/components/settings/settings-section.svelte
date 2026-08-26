<script lang="ts">
  import { faChevronRight } from '@fortawesome/free-solid-svg-icons';
  import type { Snippet } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    class?: string;
    title: string;
    headingId?: string;
    description?: string;
    children: Snippet;
    collapsible?: boolean;
    open?: boolean;
  }

  let {
    class: className,
    title,
    headingId,
    description,
    children,
    collapsible = false,
    open = $bindable(false)
  }: Props = $props();

  const componentId = $props.id();
  const titleId = $derived(headingId ?? `${componentId}-title`);
  const descriptionId = `${componentId}-description`;
</script>

{#snippet sectionContents()}
  {#if description}
    <p id={descriptionId} class="mt-2 text-sm text-gray-600">{description}</p>
  {/if}
  <div class="mt-2 divide-y divide-gray-400/40">
    {@render children()}
  </div>
{/snippet}

<section
  class={['min-w-0', className]}
  aria-labelledby={titleId}
  aria-describedby={description ? descriptionId : undefined}
>
  {#if collapsible}
    <details class="group" bind:open>
      <summary
        class="flex cursor-pointer list-none items-center gap-2 border-b border-black pb-1 [&::-webkit-details-marker]:hidden"
      >
        <Fa
          icon={faChevronRight}
          class="text-sm text-gray-500 transition-transform duration-150 group-open:rotate-90"
        />
        <h2 id={titleId} class="text-xl font-medium">{title}</h2>
      </summary>
      {@render sectionContents()}
    </details>
  {:else}
    <h2 id={titleId} class="border-b border-black pb-1 text-xl font-medium">
      {title}
    </h2>
    {@render sectionContents()}
  {/if}
</section>
