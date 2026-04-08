<script lang="ts">
  interface Props {
    checked: boolean;
    label: string;
    class?: string;
  }

  let { checked = $bindable(), label, class: className = '' }: Props = $props();
</script>

<label class="flex items-center gap-3 cursor-pointer select-none {className}">
  <span
    class="relative inline-block w-10 h-6 rounded-full transition-colors"
    class:bg-blue-500={checked}
    class:bg-gray-500={!checked}
  >
    <input type="checkbox" class="sr-only" bind:checked />
    <span
      class="absolute top-1 left-1 w-4 h-4 rounded-full bg-white transition-transform"
      class:translate-x-4={checked}
    ></span>
  </span>
  <span>{label}</span>
</label>
