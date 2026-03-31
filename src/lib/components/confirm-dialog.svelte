<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { createEventDispatcher } from 'svelte';

  export let dialogHeader: string;
  export let dialogMessage: string;
  export let contentStyles: string = '';
  export let showCancel = true;
  export let resolver: (arg0: boolean) => void;

  const dispatch = createEventDispatcher<{
    close: void;
  }>();

  function closeDialog(wasCanceled = false) {
    resolver(wasCanceled);
    dispatch('close');
  }
</script>

<DialogTemplate>
  {#snippet header()}
    {dialogHeader}
  {/snippet}
  {#snippet content()}
    <p style={contentStyles}>{dialogMessage}</p>
  {/snippet}
  {#snippet footer()}
    <div class="flex grow justify-between">
      <button
        class={buttonClasses}
        class:invisible={!showCancel}
        on:click={() => closeDialog(true)}
      >
        Cancel
        <Ripple />
      </button>
      <button class={buttonClasses} on:click={() => closeDialog()}>
        Confirm
        <Ripple />
      </button>
    </div>
  {/snippet}
</DialogTemplate>
