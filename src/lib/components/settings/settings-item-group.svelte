<script lang="ts">
  import type { Snippet } from 'svelte';
  import { faCircleQuestion } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';
  import Popover from '../popover/popover.svelte';

  interface Props {
    title: string;
    tooltip?: string;
    applyHeaderClasses?: boolean;
    header?: Snippet;
    children?: Snippet;
  }

  let { title, tooltip = '', applyHeaderClasses = true, header, children }: Props = $props();
</script>

<section class="pb-8 md:pb-3">
  <div class="flex">
    <h2 class="mb-2" class:text-xl={applyHeaderClasses} class:font-medium={applyHeaderClasses}>
      {#if tooltip}
        <Popover contentText={tooltip} contentStyles="padding: 0.5rem;">
          <Fa icon={faCircleQuestion} slot="icon" class="mx-2" />
          <span class="capitalize">{title}</span>
        </Popover>
      {:else}
        <span class="capitalize">{title}</span>
      {/if}
    </h2>
    {@render header?.()}
  </div>
  <div>
    {@render children?.()}
  </div>
</section>
