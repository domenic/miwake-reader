<script lang="ts">
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import type { Snippet } from 'svelte';

  interface Props<T> {
    faIcon?: IconDefinition;
    label: string;
    title?: string;
    items?: T[];
    onselect?: (item: T) => void | Promise<void>;
    icon?: Snippet;
    item?: Snippet<[T, () => void]>;
  }

  let {
    faIcon,
    label,
    title,
    items = [],
    onselect,
    icon: iconSnippet,
    item
  }: Props<any> = $props();

  let popover = $state<Popover>();

  function closeMenu() {
    popover?.toggleOpen();
  }

  async function handleSelect(itemToSelect: any) {
    if (itemToSelect.disabled) {
      return;
    }

    await onselect?.(itemToSelect);
    closeMenu();
  }
</script>

<Popover
  placement="bottom"
  fallbackPlacements={['bottom-end', 'bottom-start']}
  yOffset={0}
  bind:this={popover}
>
  {#snippet icon()}
    <HeaderButton {faIcon} {title} label={`${label} ▾`} icon={iconSnippet} />
  {/snippet}
  {#snippet content()}
    <div class="inline-flex flex-col bg-gray-700">
      {#each items as menuItem}
        {#if item}
          {@render item(menuItem, closeMenu)}
        {:else}
          <button
            type="button"
            class="w-full px-4 py-2 text-left text-sm whitespace-nowrap hover:bg-white hover:text-gray-700"
            class:cursor-not-allowed={menuItem.disabled}
            class:text-gray-500={menuItem.disabled}
            class:hover:bg-white={!menuItem.disabled}
            class:hover:text-gray-700={!menuItem.disabled}
            disabled={menuItem.disabled}
            title={menuItem.title}
            onclick={() => handleSelect(menuItem)}
          >
            {menuItem.label}
          </button>
        {/if}
      {/each}
    </div>
  {/snippet}
</Popover>
