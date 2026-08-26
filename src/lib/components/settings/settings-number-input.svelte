<script lang="ts">
  import { clamp } from '$lib/functions/utils';

  interface Props {
    id: string;
    value: number;
    unit: string;
    min?: number;
    max?: number;
    step?: number;
    disabled?: boolean;
    labelledBy?: string;
    describedBy?: string;
  }

  let {
    id,
    value = $bindable(),
    unit,
    min,
    max,
    step,
    disabled = false,
    labelledBy,
    describedBy
  }: Props = $props();

  const descriptionIds = $derived(
    describedBy === undefined ? `${id}-unit` : `${describedBy} ${id}-unit`
  );

  function inRange(candidate: number | undefined): candidate is number {
    return (
      candidate !== undefined &&
      Number.isFinite(candidate) &&
      (min === undefined || candidate >= min) &&
      (max === undefined || candidate <= max)
    );
  }

  let inputValue: number | undefined = $derived(value);

  function updateInputValue(candidate: number | undefined) {
    inputValue = candidate;
    if (inRange(candidate)) value = candidate;
  }

  function normalizeInputValue() {
    const candidate = inputValue === undefined || !Number.isFinite(inputValue) ? value : inputValue;
    const normalizedValue = Number.isFinite(candidate)
      ? clamp(candidate, min ?? Number.NEGATIVE_INFINITY, max ?? Number.POSITIVE_INFINITY)
      : (min ?? 0);

    inputValue = normalizedValue;
    value = normalizedValue;
  }
</script>

<div class="inline-flex min-w-0 items-baseline gap-2">
  <input
    {id}
    type="number"
    class="w-28 min-w-0 rounded-none border-0 border-b-2 border-gray-400/50 bg-transparent px-1.5 py-1 text-inherit transition-colors focus:border-b-black focus:ring-0 focus:outline-none focus:shadow-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-color disabled:border-gray-300 disabled:text-gray-400"
    aria-labelledby={labelledBy}
    aria-describedby={descriptionIds}
    bind:value={() => inputValue, updateInputValue}
    {min}
    {max}
    {step}
    {disabled}
    onblur={normalizeInputValue}
  />
  <span
    id={`${id}-unit`}
    class={['whitespace-nowrap text-sm', disabled ? 'text-gray-400' : 'text-gray-600']}>{unit}</span
  >
</div>
