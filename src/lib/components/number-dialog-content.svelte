<script lang="ts">
  import { untrack } from 'svelte';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses, dialogActionsClasses, dialogTitleClasses } from '$lib/css-classes';

  interface Props {
    title: string;
    minValue: number;
    maxValue: number;
    actionLabel?: string;
    setResult: (value: number) => void;
  }

  let { title, minValue, maxValue, actionLabel = 'Confirm', setResult }: Props = $props();

  let target = $state(untrack(() => minValue));
</script>

<h2 class={dialogTitleClasses}>{title}</h2>
<form
  method="dialog"
  onsubmit={() => setResult(target)}
  class="flex flex-col gap-5 pt-5 text-sm sm:text-base"
>
  <input type="number" min={minValue} max={maxValue} bind:value={target} required />
  <div class={dialogActionsClasses}>
    <button use:ripple class={buttonClasses} value="cancel" type="submit" formnovalidate>
      Cancel
    </button>
    <button use:ripple class={buttonClasses} value="confirm" type="submit">{actionLabel}</button>
  </div>
</form>
