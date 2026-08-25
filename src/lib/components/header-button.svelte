<script lang="ts" module>
  import type { ResolvedPathname } from '$app/types';
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import type { Snippet } from 'svelte';

  type Variant = 'action' | 'tab';
  type Width = 'default' | 'wide';

  /**
   * Wider than a DOM click handler so the same function can back a button, which passes the
   * `MouseEvent` through, and a `HeaderMenuButton` entry, which awaits the result before closing
   * the menu.
   */
  export type HeaderClickHandler = (event: MouseEvent) => void | Promise<void>;

  interface CommonProps {
    faIcon?: IconDefinition;
    label: string;
    /** Replaces `label` below the `md` breakpoint, where horizontal space is scarce. */
    mobileLabel?: string;
    menuIndicator?: boolean;
    title?: string;
    selected?: boolean;
    fill?: boolean;
    variant?: Variant;
    width?: Width;
    class?: string;
    popoverTarget?: string;
    icon?: Snippet;
  }

  type Props = CommonProps &
    (
      | { href: ResolvedPathname; disabled?: never; onclick?: never }
      | { href?: undefined; disabled?: boolean; onclick?: HeaderClickHandler }
    );

  /**
   * A header control described as data, so a header can spread it straight onto a `HeaderButton`
   * on wide viewports and pass it as a `HeaderMenuButton` item below the `md` breakpoint.
   * `faIcon` and `title` are required here even though buttons render without them: a data record
   * cannot carry the `icon` snippet alternative, and only tab-style usages go without tooltips.
   */
  export type HeaderAction = Props &
    Required<Pick<CommonProps, 'faIcon' | 'title'>> & {
      /** Menu entries have room for longer labels; falls back to `label`. */
      menuLabel?: string;
    };
</script>

<script lang="ts">
  import { ripple } from '$lib/components/ripple';
  import Fa from 'svelte-fa';

  let {
    faIcon,
    label,
    mobileLabel,
    menuIndicator = false,
    title,
    disabled = false,
    selected = false,
    fill = false,
    variant = 'action',
    width = 'default',
    class: extraClasses = '',
    popoverTarget,
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
  // `fill` and `wide` only shape their own breakpoints: below `md` a button either stretches to
  // its container (`fill`) or keeps its natural minimum, while `wide` reserves extra room for
  // labels that toggle (e.g. "Complete"/"In Progress") without shifting neighboring buttons.
  const widthClasses = {
    default: '',
    wide: 'md:w-20 md:shrink-0'
  } satisfies Record<Width, string>;

  let classes = $derived(
    [
      'flex h-(--header-height) min-w-16 flex-col items-center justify-center px-2 text-center text-xs select-none',
      fill ? 'max-md:w-full max-md:min-w-0' : '',
      variantClasses[variant],
      widthClasses[width],
      variant === 'action' && selected ? 'opacity-100' : '',
      variant === 'tab' && selected ? 'bg-gray-900 hover:bg-gray-800' : '',
      variant === 'tab' && !selected ? 'hover:bg-gray-900' : '',
      variant === 'action' && !disabled ? 'hover:opacity-100' : '',
      disabled ? 'cursor-not-allowed opacity-30' : '',
      extraClasses
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
    {#if mobileLabel !== undefined && mobileLabel !== label}
      <span class="md:hidden">
        {mobileLabel}{#if menuIndicator}<span aria-hidden="true" data-menu-indicator> ▾</span>{/if}
      </span>
      <span class="hidden md:inline">
        {label}{#if menuIndicator}<span aria-hidden="true" data-menu-indicator> ▾</span>{/if}
      </span>
    {:else}
      <span>
        {label}{#if menuIndicator}<span aria-hidden="true" data-menu-indicator> ▾</span>{/if}
      </span>
    {/if}
  {/if}
{/snippet}

{#if href !== undefined}
  <!-- Internal destinations are resolved by the caller before reaching this renderer. -->
  <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
  <a use:ripple {href} {title} class={classes} aria-current={selected ? 'page' : undefined}>
    {@render content()}
  </a>
{:else}
  <button
    use:ripple
    type="button"
    {title}
    {disabled}
    class={classes}
    popovertarget={popoverTarget}
    {onclick}
  >
    {@render content()}
  </button>
{/if}
