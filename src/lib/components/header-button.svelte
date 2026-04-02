<script lang="ts">
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import { ripple } from '$lib/components/ripple';
  import { quintOut } from 'svelte/easing';
  import type { MouseEventHandler } from 'svelte/elements';
  import type { Snippet } from 'svelte';
  import { scale } from 'svelte/transition';
  import Fa from 'svelte-fa';

  type Variant = 'action' | 'tab';

  interface Props {
    faIcon?: IconDefinition;
    label?: string;
    title?: string;
    disabled?: boolean;
    selected?: boolean;
    variant?: Variant;
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
    onclick,
    icon
  }: Props = $props();

  const iconWrapperBaseClasses = 'flex items-center justify-center leading-none';
  const labeledIconWrapperClasses = `${iconWrapperBaseClasses} mb-0.5`;
  const labeledFontAwesomeIconClasses = `${labeledIconWrapperClasses} text-sm xl:text-xs`;
  const inAnimationParams = {
    delay: 150,
    duration: 150,
    easing: quintOut
  };
  const outAnimationParams = {
    duration: 150,
    easing: quintOut
  };
  const variantClasses = {
    action: 'min-w-16 px-2 opacity-60 transition-opacity xl:text-[10px]',
    tab: 'px-3'
  } satisfies Record<Variant, string>;
</script>

<button
  use:ripple
  type="button"
  in:scale={inAnimationParams}
  out:scale={outAnimationParams}
  {title}
  {disabled}
  class={`flex h-12 flex-col items-center justify-center text-center text-xs select-none xl:h-10 ${variantClasses[variant]}`}
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
    <span class={labeledIconWrapperClasses}>
      {@render icon()}
    </span>
  {:else if faIcon}
    <Fa icon={faIcon} class={labeledFontAwesomeIconClasses} />
  {/if}

  {#if label}
    <span>{label}</span>
  {/if}
</button>
