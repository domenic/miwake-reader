<script lang="ts">
  import { browser } from '$app/environment';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import { confirmDialogRequest$ } from '$lib/data/simple-dialogs';

  let open = $state(false);
  let dialogElement = $state<HTMLDialogElement>();

  $effect(() => {
    if ($confirmDialogRequest$) {
      open = true;
    }
  });

  $effect(() => {
    if (!browser || !dialogElement) {
      return;
    }

    if (open === dialogElement.open) {
      return;
    }

    if (open) {
      dialogElement.showModal();
    } else {
      dialogElement.close();
    }
  });

  function handleResolve(wasCanceled: boolean) {
    const request = $confirmDialogRequest$;
    confirmDialogRequest$.set(undefined);
    request?.resolve(wasCanceled);
  }

  function onDialogClose() {
    const wasCanceled = dialogElement?.returnValue !== 'confirm';
    open = false;
    handleResolve(wasCanceled);
  }
</script>

{#if $confirmDialogRequest$}
  <dialog
    bind:this={dialogElement}
    class="writing-horizontal-tb mdc-elevation--z24 fixed inset-0 m-auto rounded-sm border-none bg-white p-6"
    closedby="any"
    onclose={onDialogClose}
  >
    <h2 class="weight-medium mb-5 text-xl">{$confirmDialogRequest$.title}</h2>
    <p class="max-h-[60vh] overflow-auto whitespace-pre-line">{$confirmDialogRequest$.message}</p>
    <form method="dialog" class="flex grow flex-wrap items-center justify-between pt-5">
      <button use:ripple class={buttonClasses} value="cancel" type="submit">Cancel</button>
      <button use:ripple class={buttonClasses} value="confirm" type="submit">Confirm</button>
    </form>
  </dialog>
{/if}
