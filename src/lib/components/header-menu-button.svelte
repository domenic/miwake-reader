<script lang="ts" module>
  import type { ResolvedPathname } from '$app/types';
  import type { HeaderClickHandler } from '$lib/components/header-button.svelte';

  /**
   * The contract of the default item renderer: entries show `menuLabel` (falling back to
   * `label`), `href` items render as links, and everything else renders as a button invoking
   * `onclick` — awaited, so slow work finishes before the menu closes. `HeaderAction` records
   * satisfy this shape, so headers can pass the same objects here and to `HeaderButton`.
   */
  export interface HeaderMenuItem {
    label: string;
    menuLabel?: string;
    title?: string;
    href?: ResolvedPathname;
    selected?: boolean;
    disabled?: boolean;
    onclick?: HeaderClickHandler;
  }
</script>

<script lang="ts" generics="T extends HeaderMenuItem">
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    faIcon?: IconDefinition;
    label: string;
    title?: string;
    fill?: boolean;
    items?: T[];
    icon?: Snippet;
    item?: Snippet<[T, () => void]>;
  }

  let { faIcon, label, title, fill = false, items = [], icon: iconSnippet, item }: Props = $props();

  let popover = $state<Popover>();

  function closeMenu() {
    popover?.toggleOpen();
  }

  async function handleSelect(itemToSelect: T, event: MouseEvent) {
    if (itemToSelect.disabled) {
      return;
    }

    await itemToSelect.onclick?.(event);
    closeMenu();
  }
</script>

<Popover
  placement="bottom"
  fallbackPlacements={['bottom-end', 'bottom-start']}
  innerContainerClasses={fill ? 'max-md:min-w-0 max-md:flex-1' : ''}
  yOffset={0}
  bind:this={popover}
>
  {#snippet icon()}
    <HeaderButton
      {faIcon}
      {title}
      {fill}
      label={`${label} ▾`}
      mobileLabel={label}
      icon={iconSnippet}
    />
  {/snippet}
  {#snippet content()}
    <div class="inline-flex flex-col bg-gray-700">
      {#each items as menuItem (menuItem)}
        {#if item}
          {@render item(menuItem, closeMenu)}
        {:else if menuItem.href !== undefined && !menuItem.disabled}
          <!-- Internal destinations are resolved by the caller before reaching this renderer. -->
          <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -->
          <a
            href={menuItem.href}
            aria-current={menuItem.selected ? 'page' : undefined}
            class="w-full px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-white hover:text-gray-700"
            class:bg-white={menuItem.selected}
            class:text-gray-700={menuItem.selected}
            title={menuItem.title}
            onclick={closeMenu}
          >
            {menuItem.menuLabel ?? menuItem.label}
          </a>
        {:else}
          <button
            type="button"
            aria-current={menuItem.selected ? 'page' : undefined}
            class="w-full px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-white hover:text-gray-700"
            class:bg-white={menuItem.selected}
            class:text-gray-700={menuItem.selected}
            class:cursor-not-allowed={menuItem.disabled}
            class:text-gray-500={menuItem.disabled}
            class:hover:bg-white={!menuItem.disabled}
            class:hover:text-gray-700={!menuItem.disabled}
            disabled={menuItem.disabled}
            title={menuItem.title}
            onclick={(event) => handleSelect(menuItem, event)}
          >
            {menuItem.menuLabel ?? menuItem.label}
          </button>
        {/if}
      {/each}
    </div>
  {/snippet}
</Popover>
