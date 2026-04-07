<script lang="ts">
  import { browser } from '$app/environment';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import { messageDialogRequest$ } from '$lib/data/simple-dialogs';

  let open = $state(false);
  let dialogElement = $state<HTMLDialogElement>();

  $effect(() => {
    if ($messageDialogRequest$) {
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

  function onDialogClose() {
    open = false;
    messageDialogRequest$.set(undefined);
  }
</script>

{#if $messageDialogRequest$}
  <dialog
    bind:this={dialogElement}
    class="writing-horizontal-tb mdc-elevation--z24 fixed inset-0 m-auto rounded-sm border-none bg-white p-6"
    closedby="closerequest"
    onclose={onDialogClose}
  >
    <h2 class="weight-medium mb-5 text-xl">{$messageDialogRequest$.title}</h2>
    <p class="max-h-[60vh] overflow-auto whitespace-pre-line">{$messageDialogRequest$.message}</p>
    <form method="dialog" class="flex grow justify-end pt-5">
      <button use:ripple class={buttonClasses} value="close" type="submit">Close</button>
    </form>
  </dialog>
{/if}
