<script lang="ts">
  import type { MouseEventHandler, KeyboardEventHandler } from 'svelte/elements';

  interface Props {
    selected: boolean;
    disabled: boolean;
    d: string;
    viewBox: string;
    label: string;
    onclick?: MouseEventHandler<HTMLDivElement>;
    onkeyup?: KeyboardEventHandler<HTMLDivElement>;
  }

  let { selected, disabled, d, viewBox, label, onclick, onkeyup }: Props = $props();
</script>

<div
  tabindex="0"
  role="button"
  class="border py-4 text-center hover:border hover:border-current"
  class:border-transparent={!selected}
  class:border-current={selected}
  class:opacity-5={disabled}
  class:cursor-not-allowed={disabled}
  class:hover:border-transparent={disabled}
  {onclick}
  {onkeyup}
>
  <svg
    class="inline-block h-8 w-8 md:h-14 md:w-14 lg:h-20 lg:w-20"
    xmlns="http://www.w3.org/2000/svg"
    {viewBox}
  >
    <path class="fill-current" {d} />
  </svg>
  <div class="mt-2">{label}</div>
</div>
