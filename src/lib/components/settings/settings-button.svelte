<script lang="ts">
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import type { Snippet } from 'svelte';

  interface Props {
    variant?: 'default' | 'warning' | 'danger';
    onclick: (event: MouseEvent) => void;
    disabled?: boolean;
    children: Snippet;
  }

  let { variant = 'default', onclick, disabled = false, children }: Props = $props();

  const variantOverrides = {
    default: '',
    warning: '!text-amber-800',
    danger: '!text-red-800'
  };
</script>

<button
  use:ripple
  type="button"
  {disabled}
  {onclick}
  class={[buttonClasses, variantOverrides[variant], 'disabled:opacity-50']}
>
  {@render children()}
</button>
