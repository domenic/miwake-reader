<script lang="ts">
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import { labelIconClasses } from '$lib/css-classes';
  import { dummyFn } from '$lib/functions/utils';
  import Fa from 'svelte-fa';

  export let icon: IconDefinition;
  export let title: string;
  export let label: string | undefined = undefined;
  export let disabled: boolean = false;
</script>

<div
  tabindex="0"
  role="button"
  {title}
  class={labelIconClasses}
  style:cursor={disabled ? 'not-allowed' : undefined}
  on:click
  on:keyup={dummyFn}
>
  <Fa {icon} class="text-sm xl:text-xs" />
  {#if label}<span>{label}</span>{/if}
</div>
