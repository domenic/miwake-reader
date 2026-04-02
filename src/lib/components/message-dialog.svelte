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
    <button use:ripple class={buttonClasses} onclick={() => onclose?.()}>Close</button>
  {/snippet}
</DialogTemplate>
