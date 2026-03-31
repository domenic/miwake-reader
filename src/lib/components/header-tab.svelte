<script lang="ts">
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';

  export let icon: IconDefinition;
  export let label: string;
  export let active: boolean = false;
  export let title: string | undefined = undefined;
</script>

<button
  {title}
  class="flex flex-col items-center justify-center h-12 xl:h-10 px-3 text-xs cursor-pointer"
  class:bg-gray-900={active}
  class:hover:bg-gray-800={active}
  class:hover:bg-gray-900={!active}
  on:click
>
  <Fa class="mb-0.5" {icon} />
  {label}
  <slot />
</button>
