<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { buttonClasses } from '$lib/css-classes';
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';

  export let title: string;

  export let message: string;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();
</script>

<DialogTemplate>
  {#snippet header()}
    {title}
  {/snippet}
  {#snippet content()}
    <p>{message}</p>
  {/snippet}
  {#snippet footer()}
    <button class={buttonClasses} on:click={() => dispatch('close')}>
      Close
      <Ripple />
    </button>
  {/snippet}
</DialogTemplate>
