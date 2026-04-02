<script lang="ts">
  import { buttonClasses } from '$lib/css-classes';
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import { ripple } from '$lib/components/ripple';

  interface Props {
    title: string;
    message: string;
    onclose?: () => void;
  }

  let { title, message, onclose }: Props = $props();
</script>

<DialogTemplate>
  {#snippet header()}
    {title}
  {/snippet}
  {#snippet content()}
    <p>{message}</p>
  {/snippet}
  {#snippet footer()}
    <button class={buttonClasses} onclick={() => onclose?.()} use:ripple>Close</button>
  {/snippet}
</DialogTemplate>
