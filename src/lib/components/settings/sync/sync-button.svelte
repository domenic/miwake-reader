<script lang="ts">
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'default' | 'primary' | 'warning' | 'danger';
    onclick?: (event: MouseEvent) => void;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    disabled?: boolean;
    children: Snippet;
  }

  let {
    variant = 'default',
    onclick,
    type = 'button',
    value,
    disabled = false,
    children
  }: Props = $props();

  const variantOverrides = {
    default: '',
    primary: '',
    warning: '!text-amber-800',
    danger: '!text-red-800'
  };
</script>

<button
  use:ripple
  {type}
  {value}
  {disabled}
  {onclick}
  class="{buttonClasses} {variantOverrides[
    variant
  ]} disabled:cursor-not-allowed disabled:opacity-50"
>
  {@render children()}
</button>
