<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';

  interface Props {
    dialogHeader: string;
    dialogMessage: string;
    contentStyles?: string;
    showCancel?: boolean;
    resolver: (arg0: boolean) => void;
    onclose?: () => void;
  }

  let {
    dialogHeader,
    dialogMessage,
    contentStyles = '',
    showCancel = true,
    resolver,
    onclose
  }: Props = $props();

  function closeDialog(wasCanceled = false) {
    resolver(wasCanceled);
    onclose?.();
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
      <button class={buttonClasses} class:invisible={!showCancel} onclick={() => closeDialog(true)}>
        Cancel
        <Ripple />
      </button>
      <button class={buttonClasses} onclick={() => closeDialog()}>
        Confirm
        <Ripple />
      </button>
    </div>
  {/snippet}
</DialogTemplate>
