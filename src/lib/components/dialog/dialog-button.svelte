<script lang="ts">
  import type { Snippet } from 'svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { ripple } from '$lib/components/ripple';

  interface Props {
    danger?: boolean;
    onclick?: (event: MouseEvent) => void;
    type?: 'button' | 'submit' | 'reset';
    value?: string;
    disabled?: boolean;
    formnovalidate?: boolean;
    children: Snippet;
  }

  let {
    danger = false,
    onclick,
    type = 'submit',
    value,
    disabled = false,
    formnovalidate = false,
    children
  }: Props = $props();
</script>

<button
  use:ripple
  {type}
  {value}
  {disabled}
  {formnovalidate}
  {onclick}
  class="{buttonClasses} {danger
    ? 'text-red-800!'
    : ''} disabled:cursor-not-allowed disabled:opacity-50"
>
  {@render children()}
</button>
