<script lang="ts">
  import type { MouseEventHandler } from 'svelte/elements';
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import { labelIconClasses } from '$lib/css-classes';
  import { dummyFn } from '$lib/functions/utils';
  import Fa from 'svelte-fa';

  interface Props {
    icon: IconDefinition;
    title: string;
    label?: string;
    disabled?: boolean;
    onclick?: MouseEventHandler<HTMLDivElement>;
  }

  let { icon, title, label, disabled = false, onclick }: Props = $props();
</script>

<div
  tabindex="0"
  role="button"
  {title}
  class={labelIconClasses}
  style:cursor={disabled ? 'not-allowed' : undefined}
  {onclick}
  onkeyup={dummyFn}
>
  <Fa {icon} class="text-sm xl:text-xs" />
  {#if label}<span>{label}</span>{/if}
</div>
