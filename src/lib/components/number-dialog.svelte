<script module lang="ts">
  import NumberDialog from '$lib/components/number-dialog.svelte';
  import { showDialog } from '$lib/components/dialog/show-dialog';

  export function showNumberDialog({
    title,
    minValue,
    maxValue,
    actionLabel,
    label = title
  }: {
    title: string;
    minValue: number;
    maxValue: number;
    actionLabel?: string;
    label?: string;
  }) {
    let value: number | undefined;
    return showDialog<number | undefined>(
      NumberDialog,
      { title, minValue, maxValue, actionLabel, label, setResult: (v: number) => (value = v) },
      {
        closedBy: 'any',
        resolveResult: (returnValue) => (returnValue === 'confirm' ? value : undefined)
      }
    );
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import DialogButton from '$lib/components/dialog/dialog-button.svelte';
  import DialogContentShell from '$lib/components/dialog/dialog-content-shell.svelte';

  interface Props {
    title: string;
    minValue: number;
    maxValue: number;
    actionLabel?: string;
    label: string;
    setResult: (value: number) => void;
  }

  let { title, minValue, maxValue, actionLabel = 'Confirm', label, setResult }: Props = $props();

  let target = $state(untrack(() => minValue));
</script>

<DialogContentShell {title} onsubmit={() => setResult(target)}>
  <label class="mx-auto block w-40 max-w-full">
    <span class="block text-gray-600">{label}</span>
    <input
      type="number"
      min={minValue}
      max={maxValue}
      bind:value={target}
      required
      class="mt-1 w-full"
    />
  </label>

  {#snippet actions()}
    <DialogButton behavior="close">Cancel</DialogButton>
    <DialogButton behavior="submit" value="confirm">{actionLabel}</DialogButton>
  {/snippet}
</DialogContentShell>
