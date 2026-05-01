<script lang="ts">
  import { browser } from '$app/environment';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import HeaderButton from '$lib/components/header-button.svelte';
  import HeaderMenuButton from '$lib/components/header-menu-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import { baseHeaderClasses, headerDividerClasses } from '$lib/css-classes';
  import { SortDirection } from '$lib/data/sort-types';
  import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
  import { StorageKey } from '$lib/data/storage/storage-types';
  import { storageSource$ } from '$lib/data/storage/storage-view';
  import { booklistSortOptions$, fileCountData$ } from '$lib/data/store';
  import { inputAllowDirectory } from '$lib/functions/file-dom/input-allow-directory';
  import { inputFile } from '$lib/functions/file-dom/input-file';
  import {
    faArrowDownShortWide,
    faArrowDownWideShort,
    faBug,
    faCalendarXmark,
    faCircleXmark,
    faFile,
    faFolder,
    faSortDown,
    faSortUp,
    faTrash
  } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';

  const supportsDirectoryPicking = !browser || 'webkitdirectory' in HTMLInputElement.prototype;

  interface Props {
    selectMode: boolean;
    selectedCount: number;
    hasBooks: boolean;
    /**
     * When non-zero, the header takes over to show a progress bar
     * and a cancel button. Imports of large libraries and bulk
     * deletes can run for minutes; this is the affordance to abort.
     */
    replicationProgress: number;
    replicationToProgress: number;
    replicationProgressRemaining: string;
    cancelTooltip: string;
    onselectAllClick?: () => void;
    onremoveClick?: () => void;
    onbugReportClick?: () => void;
    onfilesChange?: (fileList: FileList) => void;
    ondeleteStatistics?: () => void;
    oncancelReplication?: () => void;
  }

  let {
    selectMode = $bindable(),
    selectedCount,
    hasBooks,
    replicationProgress,
    replicationToProgress,
    replicationProgressRemaining,
    cancelTooltip,
    onselectAllClick,
    onremoveClick,
    onbugReportClick,
    onfilesChange,
    ondeleteStatistics,
    oncancelReplication
  }: Props = $props();

  let fileImportElm = $state<HTMLElement>();
  let folderImportElm = $state<HTMLElement>();
  let countImportElm = $state<HTMLInputElement>();
  let showLoadCount = $state(false);

  if (browser) {
    showLoadCount = new URLSearchParams(window.location.search).has('count');
  }

  let sortMenuItems = $derived([
    ...($storageSource$ === StorageKey.BROWSER ? [{ property: 'id', label: 'Added (id)' }] : []),
    { property: 'title', label: 'Title' },
    { property: 'characters', label: 'Characters' },
    { property: 'lastBookModified', label: 'Last Update' },
    { property: 'lastBookOpen', label: 'Last Read' },
    { property: 'progress', label: 'Progress' },
    { property: 'lastBookmarkModified', label: 'Bookmarked' }
  ]);

  function dispatchFilesChange(fileList: FileList) {
    onfilesChange?.(fileList);
  }

  async function setCountData(fileList: FileList) {
    try {
      $fileCountData$ = JSON.parse(await FilesystemStorageHandler.readFileObject(fileList[0]));
    } catch ({ message }: any) {
      console.error(`failed to read file: ${message}`);
    }
  }
</script>

<input
  hidden
  multiple
  type="file"
  accept="application/epub+zip,.epub,.htmlz,plain/text,.txt"
  use:inputFile={dispatchFilesChange}
  bind:this={fileImportElm}
/>
<input
  hidden
  multiple
  type="file"
  use:inputAllowDirectory
  use:inputFile={dispatchFilesChange}
  bind:this={folderImportElm}
/>
<input
  hidden
  type="file"
  accept=".json,application/json"
  use:inputFile={setCountData}
  bind:this={countImportElm}
/>
<div class={baseHeaderClasses}>
  {#if !replicationToProgress}
    <div class="flex h-full justify-between">
      <div class="flex">
        <HeaderButton
          title={selectMode ? 'Disable book selection' : 'Enable book selection'}
          label="Select"
          selected={selectMode}
          onclick={() => (selectMode = hasBooks && !selectMode)}
        >
          {#snippet icon()}
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="h-3.5 w-3.5">
              <path
                class="fill-current"
                d="M20,4v12H8V4H20 M20,2H8C6.9,2,6,2.9,6,4v12c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2L20,2z M12.47,14 L9,10.5l1.4-1.41l2.07,2.08L17.6,6L19,7.41L12.47,14z M4,6H2v14c0,1.1,0.9,2,2,2h14v-2H4V6z"
              />
            </svg>
          {/snippet}
        </HeaderButton>
        {#if selectMode}
          <span
            class="flex items-center px-2 text-xl font-medium"
            title="{selectedCount} {selectedCount === 1 ? 'book' : 'books'} selected"
            >{selectedCount}</span
          >
        {/if}
        <div class={headerDividerClasses}></div>
        {#if !selectMode}
          <HeaderButton
            faIcon={faFile}
            title="Import book files"
            label="Import Files"
            onclick={() => fileImportElm?.click()}
          />
          {#if supportsDirectoryPicking}
            <HeaderButton
              faIcon={faFolder}
              title="Import books from a folder"
              label="Import Folder"
              onclick={() => folderImportElm?.click()}
            />
          {/if}
          <HeaderButton
            faIcon={faBug}
            title="Report a bug"
            label="Bug Report"
            onclick={() => onbugReportClick?.()}
          />
        {:else}
          <HeaderButton title="Select all books" label="All" onclick={() => onselectAllClick?.()}>
            {#snippet icon()}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="h-3.5 w-3.5">
                <path
                  class="fill-current"
                  d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"
                />
              </svg>
            {/snippet}
          </HeaderButton>
          {#if selectedCount > 0}
            {#if $storageSource$ === StorageKey.BROWSER}
              <HeaderButton
                faIcon={faCalendarXmark}
                title="Delete statistics for selected books"
                label="Delete Statistics"
                onclick={() => ondeleteStatistics?.()}
              />
            {/if}
            <HeaderButton
              faIcon={faTrash}
              title="Delete selected books"
              label="Delete Book"
              onclick={() => onremoveClick?.()}
            />
          {/if}
        {/if}
      </div>

      <div class="flex">
        {#if !selectMode}
          <div class="relative transform-gpu">
            <HeaderMenuButton
              title="Select sort options"
              label="Sort"
              faIcon={$booklistSortOptions$[$storageSource$].direction === SortDirection.ASC
                ? faArrowDownShortWide
                : faArrowDownWideShort}
              items={sortMenuItems}
            >
              {#snippet item(sortMenuItem, close)}
                {@const isCurrentSort =
                  $booklistSortOptions$[$storageSource$].property === sortMenuItem.property}
                {@const isCurrentSortAsc =
                  isCurrentSort &&
                  $booklistSortOptions$[$storageSource$].direction === SortDirection.ASC}
                <div
                  class="grid cursor-default grid-cols-[auto_auto_auto] text-sm hover:bg-white hover:text-gray-700"
                  class:bg-white={isCurrentSort}
                  class:text-gray-700={isCurrentSort}
                  class:hover:opacity-70={isCurrentSort}
                >
                  <button
                    type="button"
                    class="self-center justify-self-start"
                    class:text-red-500={isCurrentSortAsc}
                    class:hover:text-gray-700={isCurrentSortAsc}
                    class:hover:text-red-500={!isCurrentSortAsc}
                    onclick={() => {
                      booklistSortOptions$.next({
                        ...$booklistSortOptions$,
                        ...{
                          [$storageSource$]: {
                            property: sortMenuItem.property as Exclude<
                              keyof BookCardProps,
                              'imagePath' | 'isPlaceholder'
                            >,
                            direction: SortDirection.ASC
                          }
                        }
                      });
                      close();
                    }}
                  >
                    <Fa icon={faSortUp} class="px-4" />
                  </button>
                  <div class="py-2">
                    {sortMenuItem.label}
                  </div>
                  <button
                    type="button"
                    class="justify-self-end hover:text-red-500"
                    class:text-red-500={isCurrentSort && !isCurrentSortAsc}
                    class:hover:text-gray-700={isCurrentSort && !isCurrentSortAsc}
                    class:hover:text-red-500={!isCurrentSort || isCurrentSortAsc}
                    onclick={() => {
                      booklistSortOptions$.next({
                        ...$booklistSortOptions$,
                        ...{
                          [$storageSource$]: {
                            property: sortMenuItem.property as Exclude<
                              keyof BookCardProps,
                              'imagePath' | 'isPlaceholder'
                            >,
                            direction: SortDirection.DESC
                          }
                        }
                      });
                      close();
                    }}
                  >
                    <Fa icon={faSortDown} class="mt-1 px-4" />
                  </button>
                </div>
              {/snippet}
            </HeaderMenuButton>
          </div>
          <div class={headerDividerClasses}></div>
          {#if showLoadCount}
            <button
              type="button"
              style:color={!!$fileCountData$ ? 'red' : null}
              onclick={() => countImportElm?.click()}>C</button
            >
          {/if}
        {/if}
        <HeaderNavTabs />
      </div>
    </div>
  {:else}
    <div
      title="Cancel operation"
      class="mx-auto flex h-full items-center justify-center px-4 max-w-6xl"
    >
      <Popover contentText={cancelTooltip} contentStyles={'padding: 0.75rem'} eventType="pointer">
        <button type="button" onclick={() => oncancelReplication?.()}>
          <Fa icon={faCircleXmark} />
        </button>
      </Popover>
      <progress class="mx-4 w-full" value={replicationProgress} max={replicationToProgress}
      ></progress>
      <div class="ml-4 min-w-fit">{replicationProgressRemaining}</div>
    </div>
  {/if}
</div>
