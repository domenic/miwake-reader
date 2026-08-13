<script lang="ts">
  import type { ResolvedPathname } from '$app/types';
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import { ripple } from '$lib/components/ripple';
  import type { Snippet } from 'svelte';
  import Fa from 'svelte-fa';

  type Variant = 'action' | 'tab';
  type Width = 'default' | 'wide';

  interface CommonProps {
    faIcon?: IconDefinition;
    label?: string;
    title?: string;
    selected?: boolean;
    variant?: Variant;
    width?: Width;
    icon?: Snippet;
  }

  type Props = CommonProps &
    (
      | { href: ResolvedPathname; disabled?: never; onclick?: never }
      | { href?: undefined; disabled?: boolean; onclick?: (event: MouseEvent) => void }
    );

  let {
    faIcon,
    label,
    title,
    disabled = false,
    selected = false,
    variant = 'action',
    width = 'default',
    href,
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

  let classes = $derived(
    [
      'flex h-12 min-w-16 flex-col items-center justify-center px-2 text-center text-xs select-none',
      variantClasses[variant],
      widthClasses[width],
      variant === 'action' && selected ? 'opacity-100' : '',
      variant === 'tab' && selected ? 'bg-gray-900 hover:bg-gray-800' : '',
      variant === 'tab' && !selected ? 'hover:bg-gray-900' : '',
      variant === 'action' && !disabled ? 'hover:opacity-100' : '',
      disabled ? 'cursor-not-allowed opacity-30' : ''
    ]
      .filter(Boolean)
      .join(' ')
  );
</script>

{#snippet content()}
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
{/snippet}

{#if href !== undefined}
  <!-- Internal destinations are resolved by the caller before reaching this renderer. -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a use:ripple {href} {title} class={classes} aria-current={selected ? 'page' : undefined}>
    {@render content()}
  </a>
{:else}
  <button use:ripple type="button" {title} {disabled} class={classes} {onclick}>
    {@render content()}
  </button>
{/if}
