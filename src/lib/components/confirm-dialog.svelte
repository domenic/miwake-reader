<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import { ripple } from '$lib/components/ripple';
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
      <button
        class={buttonClasses}
        class:invisible={!showCancel}
        onclick={() => closeDialog(true)}
        use:ripple
      >
        Cancel
      </button>
      <button class={buttonClasses} onclick={() => closeDialog()} use:ripple>Confirm</button>
    </div>
  {/snippet}
</DialogTemplate>
