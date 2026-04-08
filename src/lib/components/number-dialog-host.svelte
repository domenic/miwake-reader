<script lang="ts">
  import { browser } from '$app/environment';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import { numberDialogRequest$ } from '$lib/data/simple-dialogs';

  let open = $state(false);
  let dialogElement = $state<HTMLDialogElement>();
  let target = $state(1);
  let error = $state('');

  $effect(() => {
    if ($numberDialogRequest$) {
      target = $numberDialogRequest$.minValue;
      error = '';
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

  function tryConfirm() {
    const request = $numberDialogRequest$;
    if (!request) return false;

    if (target < request.minValue || target > request.maxValue) {
      error = `Must be between ${request.minValue} and ${request.maxValue}`;
      return false;
    }

    return true;
  }

  function handleResolve(returnValue: string | undefined) {
    const request = $numberDialogRequest$;
    numberDialogRequest$.set(undefined);
    request?.resolve(returnValue === 'confirm' ? target : undefined);
  }

  function onDialogClose() {
    open = false;
    handleResolve(dialogElement?.returnValue);
  }
</script>

{#if $numberDialogRequest$}
  <dialog
    bind:this={dialogElement}
    class="writing-horizontal-tb mdc-elevation--z24 fixed inset-0 m-auto rounded-sm border-none bg-white p-6"
    closedby="any"
    onclose={onDialogClose}
  >
    <h2 class="weight-medium mb-5 text-xl">{$numberDialogRequest$.title}</h2>
    <div class="flex flex-col text-sm sm:text-base">
      <input
        type="number"
        min={$numberDialogRequest$.minValue}
        max={$numberDialogRequest$.maxValue}
        bind:value={target}
        onkeydown={(evt) => {
          if (evt.key === 'Enter' && tryConfirm()) {
            dialogElement?.close('confirm');
          }
        }}
      />
      {#if error}
        <div class="mt-4 text-red-500">{error}</div>
      {/if}
    </div>
    <form method="dialog" class="flex grow flex-wrap items-center justify-between pt-5">
      <button use:ripple class={buttonClasses} value="cancel" type="submit">Cancel</button>
      <button
        use:ripple
        class={buttonClasses}
        value="confirm"
        type="submit"
        onclick={(ev) => {
          if (!tryConfirm()) ev.preventDefault();
        }}
      >
        Confirm
      </button>
    </form>
  </dialog>
{/if}
