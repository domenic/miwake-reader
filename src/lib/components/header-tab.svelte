<script lang="ts">
  import type { MouseEventHandler } from 'svelte/elements';
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import { ripple } from '$lib/components/ripple';
  import Fa from 'svelte-fa';

  interface Props {
    icon: IconDefinition;
    label: string;
    active?: boolean;
    title?: string;
    onclick?: MouseEventHandler<HTMLButtonElement>;
  }

  let { icon, label, active = false, title, onclick }: Props = $props();
</script>

<button
  {title}
  class="flex flex-col items-center justify-center h-12 xl:h-10 px-3 text-xs cursor-pointer"
  class:bg-gray-900={active}
  class:hover:bg-gray-800={active}
  class:hover:bg-gray-900={!active}
  {onclick}
  use:ripple
>
  <Fa class="mb-0.5" {icon} />
  {label}
</button>
