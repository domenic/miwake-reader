<script lang="ts">
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import { ripple } from '$lib/components/ripple';
  import type { MouseEventHandler } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import Fa from 'svelte-fa';

  type Variant = 'action' | 'tab';
  type Width = 'default' | 'wide';

  interface Props {
    faIcon?: IconDefinition;
    label?: string;
    title?: string;
    disabled?: boolean;
    selected?: boolean;
    variant?: Variant;
    width?: Width;
    onclick?: MouseEventHandler<HTMLButtonElement>;
    icon?: Snippet;
  }

  let {
    faIcon,
    label,
    title,
    disabled = false,
    selected = false,
    variant = 'action',
    width = 'default',
    onclick,
    icon
  }: Props = $props();

  const iconClasses = 'flex items-center justify-center leading-none mb-0.5';
  const faIconClasses = `${iconClasses} text-sm`;
  const variantClasses = {
    action: 'opacity-60 transition-opacity',
    tab: ''
  } satisfies Record<Variant, string>;
  const widthClasses = {
    default: '',
    wide: 'w-20 shrink-0'
  } satisfies Record<Width, string>;
</script>

<button
  use:ripple
  type="button"
  {title}
  {disabled}
  class={`flex h-12 min-w-16 flex-col items-center justify-center px-2 text-center text-xs select-none ${variantClasses[variant]} ${widthClasses[width]}`}
  class:opacity-100={variant === 'action' && selected}
  class:bg-gray-900={variant === 'tab' && selected}
  class:hover:bg-gray-800={variant === 'tab' && selected}
  class:hover:bg-gray-900={variant === 'tab' && !selected}
  class:hover:opacity-100={variant === 'action' && !disabled}
  class:cursor-not-allowed={disabled}
  class:opacity-30={disabled}
  {onclick}
>
  {#if icon}
    <span class={iconClasses}>
      {@render icon()}
    </span>
  {:else if faIcon}
    <Fa icon={faIcon} class={faIconClasses} />
  {/if}

  {#if label}
    <span>{label}</span>
  {/if}
</button>
