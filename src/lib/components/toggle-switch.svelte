<script lang="ts">
  interface Props {
    id: string;
    checked: boolean;
    label?: string;
    class?: string;
    disabled?: boolean;
    labelledBy?: string;
    describedBy?: string;
  }

  let {
    id,
    checked = $bindable(),
    label,
    class: className,
    disabled = false,
    labelledBy,
    describedBy
  }: Props = $props();
</script>

<label
  for={id}
  class={['relative inline-flex shrink-0', label && 'items-center gap-3 select-none', className]}
>
  <input
    {id}
    type="checkbox"
    role="switch"
    class="peer sr-only"
    bind:checked
    {disabled}
    aria-labelledby={labelledBy}
    aria-describedby={describedBy}
  />
  <span
    class="h-6 w-10 rounded-full border border-white/50 bg-gray-500 transition-colors peer-checked:bg-accent-color peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent-color"
    aria-hidden="true"
  ></span>
  <span
    class="pointer-events-none absolute top-1 inset-s-1 size-4 rounded-full bg-white shadow-[0_1px_2px_rgb(0_0_0/25%)] transition-transform peer-checked:translate-x-4"
    aria-hidden="true"
  ></span>
  {#if label}<span>{label}</span>{/if}
</label>
