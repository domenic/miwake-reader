<script lang="ts">
  import { faXmark } from '@fortawesome/free-solid-svg-icons';
  import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
  import type { Snippet } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    title: string;
    icon?: IconDefinition;
    class?: string;
    onsubmit?: () => void;
    children?: Snippet;
  }

  let { title, icon = faXmark, class: className = '', onsubmit, children }: Props = $props();
</script>

<form method="dialog" class="contents" onsubmit={() => onsubmit?.()}>
  <button type="submit" {title} class={className}>
    {#if children}
      {@render children?.()}
    {:else}
      <Fa {icon} />
    {/if}
  </button>
</form>
