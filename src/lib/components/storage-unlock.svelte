<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import type { StorageUnlockAction } from '$lib/data/storage/storage-source-manager';

  /**
   * Confirm-permission dialog. The redesign dropped per-source
   * password encryption — what's left is "the browser revoked our
   * filesystem permission and the only way to re-grant it is inside
   * a user activation," which the Confirm button provides. Resolves
   * with an empty StorageUnlockAction the caller mostly uses as a
   * "user clicked through" signal.
   */
  interface Props {
    description: string;
    action: string;
    showCancel?: boolean;
    resolver: (arg0: StorageUnlockAction | undefined) => void;
    onclose?: () => void;
  }

  let { description, action, showCancel = true, resolver, onclose }: Props = $props();

  function closeDialog(data?: StorageUnlockAction) {
    resolver(data);
    onclose?.();
  }
</script>

<DialogTemplate>
  {#snippet content()}
    <div class="flex flex-col text-sm sm:text-base">
      <div>{description}</div>
      <div class="my-2">{action}</div>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="mt-2 flex grow justify-between">
      {#if showCancel}
        <button use:ripple class={buttonClasses} onclick={() => closeDialog()}> Cancel </button>
      {/if}
      <button
        use:ripple
        class={buttonClasses}
        onclick={() => closeDialog({ clientId: '', clientSecret: '' })}
      >
        Confirm
      </button>
    </div>
  {/snippet}
</DialogTemplate>
