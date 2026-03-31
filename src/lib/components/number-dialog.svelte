<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';

  interface Props {
    dialogHeader: string;
    showCancel?: boolean;
    minValue?: number;
    maxValue?: number;
    resolver: (arg0: number | undefined) => void;
    onclose?: () => void;
  }

  let {
    dialogHeader,
    showCancel = true,
    minValue = 1,
    maxValue = 1,
    resolver,
    onclose
  }: Props = $props();

  let target = $state(1);
  let error = $state('');

  function closeDialog(position?: number) {
    if (typeof position === 'number' && (position < minValue || position > maxValue)) {
      error = `Must be between ${minValue} and ${maxValue}`;
      return;
    }
    resolver(position);
    onclose?.();
  }
</script>

<DialogTemplate>
  {#snippet header()}
    {dialogHeader}
  {/snippet}
  {#snippet content()}
    <div class="flex flex-col text-sm sm:text-base">
      <input
        type="number"
        min={minValue}
        max={maxValue}
        bind:value={target}
        onkeyup={(evt) => {
          if (evt.key === 'Enter') {
            closeDialog(target);
          }
        }}
      />
      <div class="text-red-500 mt-4">{error}</div>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="flex grow justify-between">
      <button
        class={buttonClasses}
        class:invisible={!showCancel}
        onclick={() => closeDialog(undefined)}
      >
        Cancel
        <Ripple />
      </button>
      <button class={buttonClasses} onclick={() => closeDialog(target)}>
        Confirm
        <Ripple />
      </button>
    </div>
  {/snippet}
</DialogTemplate>
