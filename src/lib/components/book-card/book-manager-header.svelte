<script lang="ts">
  import { browser } from '$app/environment';
  import type { ResolvedPathname } from '$app/types';
  import BookSortMenuButton from '$lib/components/book-card/book-sort-menu-button.svelte';
  import HeaderButton, { type HeaderAction } from '$lib/components/header-button.svelte';
  import HeaderMenuButton from '$lib/components/header-menu-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import Popover from '$lib/components/popover/popover.svelte';
  import { baseHeaderClasses, headerDividerClasses } from '$lib/css-classes';
  import { FilesystemStorageHandler } from '$lib/data/storage/handler/filesystem-handler';
  import { inputAllowDirectory } from '$lib/functions/file-dom/input-allow-directory';
  import { inputFile } from '$lib/functions/file-dom/input-file';
  import {
    faBug,
    faCalendarXmark,
    faChartLine,
    faCircleXmark,
    faDownload,
    faEllipsis,
    faFile,
    faFlag,
    faFolder,
    faTrash
  } from '@fortawesome/free-solid-svg-icons';
  import Fa from 'svelte-fa';

  const supportsDirectoryPicking = !browser || 'webkitdirectory' in HTMLInputElement.prototype;

  interface Props {
    selectMode: boolean;
    bookCount: number;
    selectedCount: number;
    selectedCompletedCount: number;
    selectedPlaceholderCount: number;
    /**
     * When non-zero, the header takes over to show a progress bar
     * and a cancel button. Imports of large libraries and bulk
     * deletes can run for minutes; this is the affordance to abort.
     */
    replicationProgress: number;
    replicationToProgress: number;
    replicationProgressRemaining: string;
    cancelTooltip: string;
    fileCountData?: Record<string, number>;
    statisticsHref?: ResolvedPathname;
    onselectAllClick?: () => void;
    oncompletionChange?: (completed: boolean) => void | Promise<void>;
    ondownloadClick?: () => void | Promise<void>;
    onremoveClick?: () => void;
    onbugReportClick?: () => void;
    onfilesChange?: (fileList: FileList) => void;
    ondeleteStatistics?: () => void;
    oncancelReplication?: () => void;
  }

  let {
    selectMode = $bindable(),
    bookCount,
    selectedCount,
    selectedCompletedCount,
    selectedPlaceholderCount,
    replicationProgress,
    replicationToProgress,
    replicationProgressRemaining,
    cancelTooltip,
    fileCountData = $bindable(),
    statisticsHref,
    onselectAllClick,
    oncompletionChange,
    ondownloadClick,
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

  let allBooksSelected = $derived(bookCount > 0 && selectedCount === bookCount);
  let allSelectedBooksCompleted = $derived(
    selectedCount > 0 && selectedCompletedCount === selectedCount
  );

  const importActions: HeaderAction[] = [
    {
      faIcon: faFile,
      label: 'Import Files',
      title: 'Import book files',
      onclick: () => fileImportElm?.click()
    },
    ...(supportsDirectoryPicking
      ? [
          {
            faIcon: faFolder,
            label: 'Import Folder',
            title: 'Import books from a folder',
            onclick: () => folderImportElm?.click()
          }
        ]
      : [])
  ];

  let primarySelectionActions: HeaderAction[] = $derived([
    ...(statisticsHref
      ? [
          {
            faIcon: faChartLine,
            label: 'View Stats',
            menuLabel: 'View Statistics',
            title: 'View statistics for selected books',
            href: statisticsHref
          }
        ]
      : []),
    {
      faIcon: faFlag,
      label: allSelectedBooksCompleted ? 'In Progress' : 'Complete',
      menuLabel: allSelectedBooksCompleted ? 'Mark In Progress' : 'Mark Complete',
      title: allSelectedBooksCompleted
        ? 'Mark selected books as in progress'
        : 'Mark selected books as complete',
      width: 'wide' as const,
      onclick: () => oncompletionChange?.(!allSelectedBooksCompleted)
    },
    ...(selectedPlaceholderCount > 0
      ? [
          {
            faIcon: faDownload,
            label: 'Download',
            title: 'Download selected books to this device',
            onclick: () => ondownloadClick?.()
          }
        ]
      : [])
  ]);
  const destructiveSelectionActions: HeaderAction[] = [
    {
      faIcon: faCalendarXmark,
      label: 'Delete Stats',
      menuLabel: 'Delete Statistics',
      title: 'Delete statistics for selected books',
      onclick: () => ondeleteStatistics?.()
    },
    {
      faIcon: faTrash,
      label: 'Remove',
      menuLabel: 'Remove Books',
      title: 'Remove selected books from the library',
      onclick: () => onremoveClick?.()
    }
  ];
  let selectionMenuItems = $derived([...primarySelectionActions, ...destructiveSelectionActions]);

  function dispatchFilesChange(fileList: FileList) {
    onfilesChange?.(fileList);
  }

  async function setCountData(fileList: FileList) {
    try {
      fileCountData = JSON.parse(await FilesystemStorageHandler.readFileObject(fileList[0]));
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
<div class={baseHeaderClasses} role="toolbar" aria-label="Library controls">
  {#if !replicationToProgress}
    <div
      data-mobile-actions
      class="grid h-full grid-flow-col auto-cols-fr md:flex md:justify-between"
    >
      <div class="contents md:flex">
        <HeaderButton
          title={selectMode ? 'Disable book selection' : 'Enable book selection'}
          label="Select"
          selected={selectMode}
          onclick={() => {
            selectMode = bookCount > 0 && !selectMode;
          }}
        >
          {#snippet icon()}
            <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" class="size-3.5">
              <path
                class="fill-current"
                d="M20,4v12H8V4H20 M20,2H8C6.9,2,6,2.9,6,4v12c0,1.1,0.9,2,2,2h12c1.1,0,2-0.9,2-2V4C22,2.9,21.1,2,20,2L20,2z M12.47,14 L9,10.5l1.4-1.41l2.07,2.08L17.6,6L19,7.41L12.47,14z M4,6H2v14c0,1.1,0.9,2,2,2h14v-2H4V6z"
              />
            </svg>
          {/snippet}
        </HeaderButton>
        {#if !selectMode}
          <div class="hidden md:block {headerDividerClasses}"></div>
          <div class="hidden md:contents">
            {#each importActions as importAction (importAction.label)}
              <HeaderButton {...importAction} />
            {/each}
          </div>
          <div class="contents md:hidden">
            <HeaderMenuButton
              faIcon={faFile}
              label="Import"
              fill
              title="Import books"
              items={importActions}
            />
          </div>
          <!-- On narrow viewports the sort menu (from the trailing cluster) slots in before this. -->
          <HeaderButton
            faIcon={faBug}
            title="Report a bug"
            label="Bug Report"
            class="max-md:order-last"
            onclick={() => onbugReportClick?.()}
          />
        {:else}
          <span
            class="flex w-full items-center justify-center text-xl font-medium tabular-nums md:w-12 md:shrink-0"
            title="{selectedCount} {selectedCount === 1 ? 'book' : 'books'} selected"
            aria-live="polite"
          >
            {selectedCount}
          </span>
          <HeaderButton
            title={allBooksSelected ? 'Clear book selection' : 'Select all books'}
            label={allBooksSelected ? 'Clear All' : 'Select All'}
            selected={allBooksSelected}
            width="wide"
            onclick={() => onselectAllClick?.()}
          >
            {#snippet icon()}
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="size-3.5">
                <path
                  class="fill-current"
                  d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.48 12l-1.41 1.41L11.66 19l12-12-1.42-1.41zM.41 13.41L6 19l1.41-1.41L1.83 12 .41 13.41z"
                />
              </svg>
            {/snippet}
          </HeaderButton>
          {#if selectedCount > 0}
            <div class="hidden md:contents">
              <div class={headerDividerClasses}></div>
              {#each primarySelectionActions as selectionAction (selectionAction.label)}
                <HeaderButton {...selectionAction} />
              {/each}
              <div class={headerDividerClasses}></div>
              {#each destructiveSelectionActions as selectionAction (selectionAction.label)}
                <HeaderButton {...selectionAction} />
              {/each}
            </div>
            <div class="contents md:hidden">
              <HeaderMenuButton
                faIcon={faEllipsis}
                label="Actions"
                fill
                title="Actions for selected books"
                items={selectionMenuItems}
              />
            </div>
          {/if}
        {/if}
      </div>

      <div class="contents md:flex">
        {#if !selectMode}
          <div class="contents md:relative md:block md:transform-gpu">
            <BookSortMenuButton />
          </div>
          <div class="hidden md:block {headerDividerClasses}"></div>
          {#if showLoadCount}
            <button
              type="button"
              class="hidden md:block"
              style:color={fileCountData ? 'red' : undefined}
              onclick={() => countImportElm?.click()}>C</button
            >
          {/if}
        {/if}
        <div class="hidden md:contents">
          <HeaderNavTabs />
        </div>
      </div>
    </div>
  {:else}
    <div
      title="Cancel operation"
      class="mx-auto flex h-full items-center justify-center px-4 max-w-6xl"
    >
      <Popover contentText={cancelTooltip} contentStyles="padding: 0.75rem" eventType="pointer">
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
