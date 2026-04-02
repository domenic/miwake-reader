<script lang="ts">
  import { browser } from '$app/environment';
  import type { BookCardProps } from '$lib/components/book-card/book-card-props';
  import HeaderButton from '$lib/components/header-button.svelte';
  import HeaderMenuButton from '$lib/components/header-menu-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import { baseHeaderClasses, headerDividerClasses, pxScreen } from '$lib/css-classes';
  import { appName } from '$lib/data/env';
  import { SortDirection } from '$lib/data/sort-types';
  import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
  import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
  import { StorageKey } from '$lib/data/storage/storage-types';
  import {
    isStorageSourceAvailable,
    storageIcon$,
    storageSource$
  } from '$lib/data/storage/storage-view';
  import {
    booklistSortOptions$,
    cacheStorageData$,
    fileCountData$,
    fsStorageSource$,
    gDriveStorageSource$,
    isOnline$,
    oneDriveStorageSource$
  } from '$lib/data/store';
  import { inputAllowDirectory } from '$lib/functions/file-dom/input-allow-directory';
  import { inputFile } from '$lib/functions/file-dom/input-file';
  import { isMobile$ } from '$lib/functions/utils';
  import {
    faArrowDownShortWide,
    faArrowDownWideShort,
    faBug,
    faCalendarXmark,
    faCircleXmark,
    faCloudArrowUp,
    faFileArrowUp,
    faFileZipper,
    faFolderPlus,
    faSortDown,
    faSortUp,
    faTrash
  } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';
  import { quintOut } from 'svelte/easing';
  import { scale } from 'svelte/transition';

  interface Props {
    selectMode: boolean;
    selectedCount: number;
    hasBooks: boolean;
    cancelTooltip: string;
    replicationProgress: number;
    replicationToProgress: number;
    replicationProgressRemaining: string;
    onselectAllClick?: () => void;
    onremoveClick?: () => void;
    onbugReportClick?: () => void;
    onfilesChange?: (fileList: FileList) => void;
    onimportBackup?: (file: File) => void;
    ondeleteStatistics?: () => void;
    onreplicateData?: () => void;
    oncancelReplication?: () => void;
  }

  let {
    selectMode = $bindable(),
    selectedCount,
    hasBooks,
    cancelTooltip,
    replicationProgress,
    replicationToProgress,
    replicationProgressRemaining,
    onselectAllClick,
    onremoveClick,
    onbugReportClick,
    onfilesChange,
    onimportBackup,
    ondeleteStatistics,
    onreplicateData,
    oncancelReplication
  }: Props = $props();

  const nTranslateXHeaderMat = '-translate-x-3 xl:-translate-x-2.5';

  const inAnimationParams = {
    delay: 150,
    duration: 150,
    easing: quintOut
  };

  const outAnimationParams = {
    duration: 150,
    easing: quintOut
  };

  const storageSourceMenuItems = [
    { label: 'Browser', key: StorageKey.BROWSER, requiresConnectivity: false }
  ];

  let fileImportElm = $state<HTMLElement>();
  let folderImportElm = $state<HTMLElement>();
  let backupImportElm = $state<HTMLElement>();
  let countImportElm = $state<HTMLInputElement>();
  let showLoadCount = $state(false);

  if (browser) {
    showLoadCount = new URLSearchParams(window.location.search).has('count');

    storageSourceMenuItems.push(
      ...(isStorageSourceAvailable(StorageKey.GDRIVE, $gDriveStorageSource$, window)
        ? [
            {
              label: 'GDrive',
              key: StorageKey.GDRIVE,
              requiresConnectivity: true
            }
          ]
        : []),
      ...(isStorageSourceAvailable(StorageKey.ONEDRIVE, $oneDriveStorageSource$, window)
        ? [
            {
              label: 'OneDrive',
              key: StorageKey.ONEDRIVE,
              requiresConnectivity: true
            }
          ]
        : []),
      ...(isStorageSourceAvailable(StorageKey.FS, $fsStorageSource$, window)
        ? [
            {
              label: 'Filesystem',
              key: StorageKey.FS,
              requiresConnectivity: false
            }
          ]
        : [])
    );
  }

  let storageSourceMenuOptions = $derived(
    storageSourceMenuItems.map((sourceMenuItem) => ({
      ...sourceMenuItem,
      disabled: sourceMenuItem.requiresConnectivity && !$isOnline$
    }))
  );

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

  function dispatchImportBackup(fileList: FileList) {
    onimportBackup?.(fileList[0]);
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
  accept=".zip,application/zip"
  use:inputFile={dispatchImportBackup}
  bind:this={backupImportElm}
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
    <div class="flex h-full justify-between {pxScreen}">
      <div class="flex transform-gpu {nTranslateXHeaderMat}">
        <HeaderButton
          title={selectMode ? 'Disable book selection' : 'Enable book selection'}
          label="Select"
          selected={selectMode}
          onclick={() => (selectMode = hasBooks && !selectMode)}
        >
          {#snippet icon()}
            <svg
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
              class="h-3.5 w-3.5 xl:h-3 xl:w-3"
            >
              <path
                class="fill-current"
                d="M20,4v12H8V4H20 M20,2H8C6.9,2,6,2.9,6,4v12c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2L20,2z M12.47,14 L9,10.5l1.4-1.41l2.07,2.08L17.6,6L19,7.41L12.47,14z M4,6H2v14c0,1.1,0.9,2,2,2h14v-2H4V6z"
              />
            </svg>
          {/snippet}
        </HeaderButton>
        {#if selectMode}
          <span
            class="flex items-center px-2 text-xl font-medium xl:text-lg"
            title="{selectedCount} {selectedCount === 1 ? 'book' : 'books'} selected"
            >{selectedCount}</span
          >
        {/if}
        <div class={headerDividerClasses}></div>
        {#if !selectMode}
          <HeaderButton
            faIcon={faFileArrowUp}
            title="Import book files"
            label="Import Files"
            onclick={() => fileImportElm?.click()}
          />
          {#if !$isMobile$}
            <HeaderButton
              faIcon={faFolderPlus}
              title="Import books from a folder"
              label="Import Folder"
              onclick={() => folderImportElm?.click()}
            />
          {/if}
          <HeaderButton
            faIcon={faFileZipper}
            title={`Import ${appName} data`}
            label="Import Data"
            onclick={() => backupImportElm?.click()}
          />
          <HeaderButton
            faIcon={faBug}
            title="Report an issue"
            label="Issue Report"
            onclick={() => onbugReportClick?.()}
          />
        {:else}
          <HeaderButton title="Select all books" label="All" onclick={() => onselectAllClick?.()}>
            {#snippet icon()}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                class="h-3.5 w-3.5 xl:h-3 xl:w-3"
              >
                <path
                  class="fill-current"
                  d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"
                />
              </svg>
            {/snippet}
          </HeaderButton>
          {#if selectedCount > 0}
            <HeaderButton
              faIcon={faCloudArrowUp}
              title="Export selected book contents or data"
              label="Export"
              onclick={() => onreplicateData?.()}
            />
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
          <div
            title="Select storage source"
            class="relative transform-gpu"
            in:scale={inAnimationParams}
            out:scale={outAnimationParams}
          >
            <HeaderMenuButton
              title="Select storage source"
              label="Storage Source"
              items={storageSourceMenuOptions}
              onselect={async (sourceMenuItem) => {
                if (sourceMenuItem.key !== $storageSource$) {
                  if (!$cacheStorageData$) {
                    getStorageHandler(window, sourceMenuItem.key).clearData();
                  }

                  storageSource$.next(sourceMenuItem.key);
                }
              }}
            >
              {#snippet icon()}
                {#key $storageIcon$}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox={$storageIcon$.viewBox}
                    class="h-3.5 w-3.5 xl:h-3 xl:w-3"
                  >
                    <path class="fill-current" d={$storageIcon$.d} />
                  </svg>
                {/key}
              {/snippet}
            </HeaderMenuButton>
          </div>
          <div
            class="relative transform-gpu"
            in:scale={inAnimationParams}
            out:scale={outAnimationParams}
          >
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
      class="mx-auto flex h-full transform-gpu items-center justify-center px-4 md:px-8 lg:max-w-4xl xl:max-w-none 2xl:max-w-6xl"
      in:scale={inAnimationParams}
      out:scale={outAnimationParams}
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
