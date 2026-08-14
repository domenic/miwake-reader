<script lang="ts">
  import ToggleSwitch from '$lib/components/toggle-switch.svelte';
  import { displayTitle } from '$lib/functions/book-title';
  import { japaneseLangIfNeeded } from '$lib/functions/japanese-language';

  interface Props {
    filterDateRangeOnly: boolean;
    statisticsTitleFilters: Map<string, boolean>;
    titlesInStatisticsDateRange: Set<string>;
    ontitlefiltertoggle: (title: string, isSelected: boolean) => void;
    ontitlefiltertoggleall: (titles: Iterable<string>, isSelected: boolean) => void;
  }

  let {
    filterDateRangeOnly = $bindable(),
    statisticsTitleFilters,
    titlesInStatisticsDateRange,
    ontitlefiltertoggle,
    ontitlefiltertoggleall
  }: Props = $props();

  let titleFilter = $state('');
  let headerCheckbox = $state<HTMLInputElement>();

  let visibleTitles = $derived(
    [...statisticsTitleFilters.keys()].filter(
      (title) =>
        (!titleFilter || displayTitle(title).includes(titleFilter)) &&
        (!filterDateRangeOnly || titlesInStatisticsDateRange.has(title))
    )
  );

  let allSelected = $derived(
    visibleTitles.length > 0 && visibleTitles.every((title) => statisticsTitleFilters.get(title))
  );
  let noneSelected = $derived(visibleTitles.every((title) => !statisticsTitleFilters.get(title)));

  $effect(() => {
    if (headerCheckbox) {
      headerCheckbox.indeterminate = !allSelected && !noneSelected;
    }
  });

  function setAllVisibleTitlesSelected(isSelected: boolean) {
    ontitlefiltertoggleall(visibleTitles, isSelected);
  }
</script>

<div class="flex flex-col flex-1 px-4 pt-12 min-h-0">
  <div class="flex items-center gap-4">
    <input
      type="search"
      placeholder="Filter book list"
      class="flex-1 text-black"
      bind:value={titleFilter}
    />
  </div>
  <ToggleSwitch
    bind:checked={filterDateRangeOnly}
    label="Only show books with statistics in the target date range"
    class="mt-4"
  />
  <div class="grow mt-4 pl-1 overflow-auto">
    {#if visibleTitles.length}
      <table class="w-full">
        <thead class="sticky top-0 z-10 bg-gray-700 shadow-[0_1px_0_var(--color-gray-500)]">
          <tr>
            <th class="w-0 py-2 pr-4">
              <input
                type="checkbox"
                bind:checked={() => allSelected, setAllVisibleTitlesSelected}
                title={allSelected ? 'Deselect all' : 'Select all'}
                bind:this={headerCheckbox}
              />
            </th>
            <th class="py-2 text-left font-semibold">Book</th>
          </tr>
        </thead>
        <tbody>
          {#each visibleTitles as title (title)}
            {@const displayedTitle = displayTitle(title)}
            {@const titleLang = japaneseLangIfNeeded(displayedTitle)}
            <tr>
              <td class="py-2 pr-4">
                <input
                  type="checkbox"
                  bind:checked={
                    () => statisticsTitleFilters.get(title) ?? false,
                    (isSelected) => ontitlefiltertoggle(title, isSelected)
                  }
                />
              </td>
              <td
                class="py-2 line-clamp-3"
                class:opacity-50={!titlesInStatisticsDateRange.has(title)}
                lang={titleLang}
              >
                {displayedTitle}
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
