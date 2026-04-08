<script lang="ts">
  import DialogFormButton from '$lib/components/dialog-form-button.svelte';
  import ToggleSwitch from '$lib/components/toggle-switch.svelte';
  import { lastStatisticsFilterDateRangeOnly$ } from '$lib/data/store';

  interface Props {
    titleFilterSelections: [string, boolean][];
    titlesInStatisticsDateRange: Set<string>;
  }

  let { titleFilterSelections = $bindable(), titlesInStatisticsDateRange }: Props = $props();

  let titleFilter = $state('');
  let headerCheckbox = $state<HTMLInputElement>();

  let filteredSelections = $derived(
    titleFilterSelections.filter(
      ([title]) =>
        (!titleFilter || title.includes(titleFilter)) &&
        (!$lastStatisticsFilterDateRangeOnly$ || titlesInStatisticsDateRange.has(title))
    )
  );

  let allSelected = $derived(
    filteredSelections.length > 0 && filteredSelections.every(([, isSelected]) => isSelected)
  );
  let noneSelected = $derived(filteredSelections.every(([, isSelected]) => !isSelected));

  $effect(() => {
    if (headerCheckbox) {
      headerCheckbox.indeterminate = !allSelected && !noneSelected;
    }
  });

  function handleToggleAll() {
    const valueToSet = !allSelected;

    for (const item of filteredSelections) {
      item[1] = valueToSet;
    }
  }
</script>

<div class="flex items-center p-4">
  <DialogFormButton title="Close book filter" />
</div>
<div class="flex flex-col flex-1 px-4 min-h-0">
  <div class="flex items-center gap-4">
    <input
      type="search"
      placeholder="Filter book list"
      class="flex-1 text-black"
      bind:value={titleFilter}
    />
  </div>
  <ToggleSwitch
    bind:checked={$lastStatisticsFilterDateRangeOnly$}
    label="Only show books with statistics in the target date range"
    class="mt-4"
  />
  <div class="grow mt-4 pl-1 overflow-auto">
    {#if filteredSelections.length}
      <table class="w-full">
        <thead class="sticky top-0 z-10 bg-gray-700 shadow-[0_1px_0_theme(colors.gray.500)]">
          <tr>
            <th class="w-0 py-2 pr-4">
              <input
                type="checkbox"
                checked={allSelected}
                onchange={handleToggleAll}
                title={allSelected ? 'Deselect all' : 'Select all'}
                bind:this={headerCheckbox}
              />
            </th>
            <th class="py-2 text-left font-semibold">Book title</th>
          </tr>
        </thead>
        <tbody>
          {#each filteredSelections as item (item[0])}
            <tr>
              <td class="py-2 pr-4">
                <input type="checkbox" bind:checked={item[1]} />
              </td>
              <td
                class="py-2 line-clamp-3"
                class:opacity-50={!titlesInStatisticsDateRange.has(item[0])}
              >
                {item[0]}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {:else}
      <div class="mt-6 text-2xl text-center">No books to filter</div>
    {/if}
  </div>
</div>
