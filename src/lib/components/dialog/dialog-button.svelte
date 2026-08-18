<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useDialogController } from '$lib/components/dialog/show-dialog';
  import { buttonClasses } from '$lib/css-classes';
  import { ripple } from '$lib/components/ripple';

  interface Props {
    behavior: 'action' | 'close' | 'submit';
    danger?: boolean;
    onclick?: (event: MouseEvent) => void;
    value?: string;
    disabled?: boolean;
    children: Snippet;
  }

  let { behavior, danger = false, onclick, value, disabled = false, children }: Props = $props();

  const dialogController = useDialogController();

  function handleClick(event: MouseEvent) {
    onclick?.(event);

    if (behavior === 'close' && !event.defaultPrevented) {
      dialogController.close(value);
    }
  }
</script>

<button
  use:ripple
  type={behavior === 'submit' ? 'submit' : 'button'}
  {value}
  {disabled}
  onclick={handleClick}
  class="{buttonClasses} {danger
    ? 'text-red-800!'
    : ''} disabled:cursor-not-allowed disabled:opacity-50"
>
  {@render children()}
</button>
