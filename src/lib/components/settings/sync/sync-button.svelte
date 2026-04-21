<script lang="ts">
  import { ripple } from '$lib/components/ripple';
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

  const variantClasses = {
    default: 'bg-white text-black border-black/30 hover:bg-gray-50',
    primary: 'bg-black text-white border-black hover:bg-gray-800',
    warning: 'bg-amber-100 text-amber-900 border-amber-500 hover:bg-amber-200',
    danger: 'bg-white text-red-700 border-red-600 hover:bg-red-50'
  };
</script>

<button
  use:ripple
  {type}
  {value}
  {disabled}
  {onclick}
  class="cursor-pointer rounded-md border px-3 py-1.5 text-sm font-medium whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-50 {variantClasses[
    variant
  ]}"
>
  {@render children()}
</button>
