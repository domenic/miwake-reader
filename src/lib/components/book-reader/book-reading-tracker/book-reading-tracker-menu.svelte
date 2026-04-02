<script lang="ts">
  import {
    faChevronLeft,
    faChevronRight,
    faClockRotateLeft,
    faFloppyDisk,
    faPause,
    faPlay,
    faRepeat,
    faSpinner,
    faTrash,
    faXmark,
    type IconDefinition
  } from '@fortawesome/free-solid-svg-icons';
  import type { TrackingHistory } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import {
    getChapterData,
    type SectionWithProgress
  } from '$lib/components/book-reader/book-toc/book-toc';
  import { dialogManager } from '$lib/data/dialog-manager';
  import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';
  import type { ReadingGoal } from '$lib/data/reading-goal';
  import { lastBlurredTrackerItems$, skipKeyDownListener$ } from '$lib/data/store';
  import { secondsToMinutes, toTimeString } from '$lib/functions/statistic-util';
  import { caluclatePercentage, dummyFn } from '$lib/functions/utils';
  import { onMount } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    fontColor: string;
    backgroundColor: string;
    actionInProgress: boolean;
    hadError: boolean;
    currentReadingGoal: ReadingGoal | undefined;
    currentTimeGoal: number;
    currentCharacterGoal: number;
    currentReadingGoalStart: string;
    currentReadingGoalEnd: string;
    remainingTimeInReadingGoalWindow: string;
    wasTrackerPaused: boolean;
    canSaveStatistics: boolean;
    timeToFinishBook: string;
    sectionData: SectionWithProgress[];
    exploredCharCount: number;
    lastExploredCharCount: number;
    previousLastExploredCharCount: number;
    frozenPosition: number;
    trackingHistory: TrackingHistory[];
    sessionStatistics: BooksDbStatistic;
    todaysStatistics: BooksDbStatistic;
    allTimeStatistics: BooksDbStatistic;
    bookCompletionStatistics: Omit<BooksDbStatistic, 'title' | 'lastStatisticModified'> | undefined;
    autoScrollerStatistics: BooksDbStatistic | undefined;
    bookStartDate: string;
    ontrackermenuclosed?: () => void;
    onupdatecurrentlocation?: () => void;
    onfreezecurrentlocation?: () => void;
    onsavestatistics?: () => void;
    onrevertstatistic?: (item: TrackingHistory) => void;
  }

  let {
    fontColor,
    backgroundColor,
    actionInProgress,
    hadError,
    currentReadingGoal,
    currentTimeGoal,
    currentCharacterGoal,
    currentReadingGoalStart,
    currentReadingGoalEnd,
    remainingTimeInReadingGoalWindow,
    wasTrackerPaused = $bindable(),
    canSaveStatistics,
    timeToFinishBook,
    sectionData,
    exploredCharCount,
    lastExploredCharCount,
    previousLastExploredCharCount,
    frozenPosition,
    trackingHistory,
    sessionStatistics,
    todaysStatistics,
    allTimeStatistics,
    bookCompletionStatistics,
    autoScrollerStatistics,
    bookStartDate,
    ontrackermenuclosed,
    onupdatecurrentlocation,
    onfreezecurrentlocation,
    onsavestatistics,
    onrevertstatistic
  }: Props = $props();

  const actions = [
    { icon: faPlay, event: 'toggleTracker', title: 'Toggle Tracker' },
    { icon: faRepeat, event: 'updateCurrentLocation', title: 'Update Position' },
    { icon: faClockRotateLeft, event: 'freezeCurrentLocation', title: 'Toggle Freeze Position' },
    { icon: faFloppyDisk, event: 'saveStatistics', title: 'Save' }
  ];

  const trackingItemsPerPage = 15;

  let trackingHistoryIndex = $state(0);
  let timeToFinishChapter = $state('');

  let allStatistics = $derived(
    autoScrollerStatistics
      ? [
          { id: 'Current Session', ...sessionStatistics },
          { id: 'Today', ...todaysStatistics },
          { id: 'All Time', ...allTimeStatistics },
          ...(bookCompletionStatistics
            ? [{ id: 'Book Completion', ...bookCompletionStatistics }]
            : []),
          { id: 'Autoscroller', ...autoScrollerStatistics }
        ]
      : [
          { id: 'Current Session', ...sessionStatistics },
          { id: 'Today', ...todaysStatistics },
          { id: 'All Time', ...allTimeStatistics },
          ...(bookCompletionStatistics
            ? [{ id: 'Book Completion', ...bookCompletionStatistics }]
            : [])
        ]
  );

  let currentTrackingHistoryIndex = $derived(
    Math.max(0, trackingHistoryIndex * trackingItemsPerPage)
  );

  let trackingHistoryItems = $derived(
    trackingHistory.slice(
      currentTrackingHistoryIndex,
      currentTrackingHistoryIndex + trackingItemsPerPage
    )
  );

  let hasNextPage = $derived(
    trackingHistory.length > currentTrackingHistoryIndex + trackingItemsPerPage
  );

  onMount(() => {
    $skipKeyDownListener$ = true;
    dialogManager.dialogs$.next([
      {
        component: '<div/>',
        disableCloseOnClick: true
      }
    ]);

    if (sectionData) {
      const [mainChapters, chapterIndex] = getChapterData(sectionData);
      const currentChapter = mainChapters[chapterIndex];
      const remainingCharacters =
        (currentChapter.startCharacter ?? 0) +
        (currentChapter.characters ?? 0) -
        (exploredCharCount ?? 0);

      timeToFinishChapter = sessionStatistics.lastReadingSpeed
        ? toTimeString(
            Math.max(
              0,
              Math.floor(remainingCharacters / (sessionStatistics.lastReadingSpeed / 3600))
            )
          )
        : 'N/A';
    }

    return () => {
      $skipKeyDownListener$ = false;
      dialogManager.dialogs$.next([]);
    };
  });

  function executeAction(event: string) {
    switch (event) {
      case 'toggleTracker':
        wasTrackerPaused = !wasTrackerPaused;
        break;
      case 'updateCurrentLocation':
        onupdatecurrentlocation?.();
        break;
      case 'freezeCurrentLocation':
        onfreezecurrentlocation?.();
        break;
      case 'saveStatistics':
        onsavestatistics?.();
        break;

      default:
        break;
    }
  }

  function handleBlurredKey(dataKey: string) {
    if (window.getSelection()?.toString().trim()) {
      return;
    }

    if ($lastBlurredTrackerItems$.has(dataKey)) {
      $lastBlurredTrackerItems$.delete(dataKey);
    } else {
      $lastBlurredTrackerItems$.add(dataKey);
    }

    $lastBlurredTrackerItems$ = new Set([...$lastBlurredTrackerItems$]);
  }

  function getActionIcon(
    action: { icon: IconDefinition; event: string; title: string },
    trackerPaused: boolean
  ) {
    if (action.event === 'toggleTracker') {
      return trackerPaused ? faPlay : faPause;
    }

    return action.icon;
  }
</script>

<div class="flex items-center justify-between min-h-[60px] px-4">
  <div class="mr-4">
    {#if hadError}
      Last Update failed
    {/if}
  </div>
  <div
    tabindex="0"
    role="button"
    title="Close tracker menu"
    class="flex items-center hover:text-red-500 md:items-center"
    onclick={() => ontrackermenuclosed?.()}
    onkeyup={dummyFn}
  >
    <Fa icon={faXmark} />
  </div>
</div>
<div class="flex flex-1 flex-col overflow-auto p-4">
  {#if currentReadingGoal}
    <div class="mb-6">
      {#if currentReadingGoal.timeGoal}
        {@const timeGoalPercentage = caluclatePercentage(
          currentTimeGoal,
          currentReadingGoal.timeGoal
        )}
        <div>
          {secondsToMinutes(currentTimeGoal)} / {secondsToMinutes(currentReadingGoal.timeGoal)} Min ({timeGoalPercentage}%)
        </div>
        <!-- eslint-disable-next-line svelte/no-unknown-style-directive-property -->
        <div class="w-full rounded-full h-2.5" style:background-Color={fontColor}>
          <div
            class="h-2.5 rounded-full opacity-70"
            style:width={`${Math.min(100, timeGoalPercentage)}%`}
            style:background-color={backgroundColor}
          ></div>
        </div>
      {/if}
      {#if currentReadingGoal.characterGoal}
        {@const characterGoalPercentage = caluclatePercentage(
          currentCharacterGoal,
          currentReadingGoal.characterGoal
        )}
        <div class="mt-4">
          {currentCharacterGoal} / {currentReadingGoal.characterGoal} Characters ({characterGoalPercentage}%)
        </div>
        <!-- eslint-disable-next-line svelte/no-unknown-style-directive-property -->
        <div class="w-full rounded-full h-2.5" style:background-Color={fontColor}>
          <!-- eslint-disable svelte/no-unknown-style-directive-property -->
          <div
            class="h-2.5 rounded-full opacity-70"
            style:width={`${Math.min(100, characterGoalPercentage)}%`}
            style:background-Color={backgroundColor}
          ></div>
          <!-- eslint-enable svelte/no-unknown-style-directive-property -->
        </div>
      {/if}
      <div class="grid grid-cols-[max-content_auto] gap-x-4 gap-y-2 mt-4">
        <div>Current Reading Goal:</div>
        <div class="flex flex-col sm:block">
          <span>{currentReadingGoalStart}</span>
          {#if currentReadingGoalEnd && currentReadingGoalStart !== currentReadingGoalEnd}
            <span>-</span>
            <span>{currentReadingGoalEnd}</span>
          {/if}
        </div>
        <div>Remaining Time left:</div>
        <div>
          {remainingTimeInReadingGoalWindow}
        </div>
      </div>
    </div>
  {/if}
  {#each allStatistics as statistic (statistic.id)}
    <div class="mb-7 last:mb-4">
      <div class="flex items-center">
        <div>
          {statistic.id}
        </div>
        {#if statistic.id === 'Current Session'}
          {#each actions as action (action.event)}
            {#if action.event !== 'saveStatistics' || (action.event === 'saveStatistics' && canSaveStatistics)}
              <div
                tabindex="0"
                role="button"
                class="ml-4 hover:text-red-500"
                title={action.title}
                onclick={() => executeAction(action.event)}
                onkeyup={dummyFn}
              >
                <Fa icon={getActionIcon(action, wasTrackerPaused)} />
              </div>
            {/if}
          {/each}
        {/if}
      </div>
      <hr />
      <div class="grid grid-cols-[max-content_auto] gap-x-4 gap-y-2">
        {#if statistic.id === 'All Time'}
          <div class="mt-3">Book started on:</div>
          <div class="mt-3">{bookStartDate}</div>
        {/if}
        {#if statistic.id === 'Book Completion' && bookCompletionStatistics}
          <div class="mt-3">Completed on:</div>
          <div class="mt-3">{bookCompletionStatistics.dateKey}</div>
        {/if}
        <button
          class="text-left"
          class:mt-3={statistic.id !== 'All Time' && statistic.id !== 'Book Completion'}
          onclick={() => handleBlurredKey('charactersRead')}
        >
          Characters Read:
        </button>
        <div
          role="button"
          tabindex="0"
          class:blur={$lastBlurredTrackerItems$.has('charactersRead')}
          class:mt-3={statistic.id !== 'All Time' && statistic.id !== 'Book Completion'}
          onclick={() => handleBlurredKey('charactersRead')}
          onkeyup={dummyFn}
        >
          {statistic.charactersRead}
        </div>
        <button class="text-left" onclick={() => handleBlurredKey('lastReadingSpeed')}>
          Reading Speed:
        </button>
        <div
          role="button"
          tabindex="0"
          class:blur={$lastBlurredTrackerItems$.has('lastReadingSpeed')}
          onclick={() => handleBlurredKey('lastReadingSpeed')}
          onkeyup={dummyFn}
        >
          {statistic.lastReadingSpeed} / h
        </div>
        <button class="text-left" onclick={() => handleBlurredKey('readingTime')}>
          Reading Time:
        </button>
        <div
          role="button"
          tabindex="0"
          class:blur={$lastBlurredTrackerItems$.has('readingTime')}
          onclick={() => handleBlurredKey('readingTime')}
          onkeyup={dummyFn}
        >
          {toTimeString(statistic.readingTime)}
        </div>
        {#if statistic.id === 'Current Session'}
          <button class="text-left" onclick={() => handleBlurredKey('finishETA')}>
            Time to Finish Book:
          </button>
          <div
            role="button"
            tabindex="0"
            class:blur={$lastBlurredTrackerItems$.has('finishETA')}
            onclick={() => handleBlurredKey('finishETA')}
            onkeyup={dummyFn}
          >
            {timeToFinishBook}
          </div>
          {#if timeToFinishChapter}
            <button class="text-left" onclick={() => handleBlurredKey('finishChapterETA')}>
              Time to Finish Chapter:
            </button>
            <div
              role="button"
              tabindex="0"
              class:blur={$lastBlurredTrackerItems$.has('finishChapterETA')}
              onclick={() => handleBlurredKey('finishChapterETA')}
              onkeyup={dummyFn}
            >
              {timeToFinishChapter}
            </div>
          {/if}

          <div class="mt-3">Current Position:</div>
          <div class="mt-3">{lastExploredCharCount}</div>
          <div>Previous Position</div>
          <div>{previousLastExploredCharCount}</div>
          {#if frozenPosition > -1}
            <div>Frozen Position</div>
            <div>{frozenPosition}</div>
          {/if}
        {/if}
      </div>
      {#if statistic.id === 'Current Session' && trackingHistoryItems.length}
        <details class="mt-3 mr-4">
          <summary class="cursor-pointer">Recent History</summary>
          <div class="grid grid-cols-[repeat(4,max-content)] gap-x-8 items-center">
            {#each trackingHistoryItems as trackingHistoryItem (trackingHistoryItem.id)}
              <div>{trackingHistoryItem.dateTimeKey}</div>
              <div
                class:text-green-500={trackingHistoryItem.timeDiff > 0}
                class:text-red-500={trackingHistoryItem.timeDiff < 0}
              >
                {trackingHistoryItem.timeDiff}
              </div>
              <div
                class:text-green-500={trackingHistoryItem.characterDiff > 0}
                class:text-red-500={trackingHistoryItem.characterDiff < 0}
              >
                {trackingHistoryItem.characterDiff}
              </div>
              <div class="flex">
                <button
                  title="Revert item"
                  class="hover:text-red-500"
                  onclick={() => onrevertstatistic?.(trackingHistoryItem)}
                >
                  <Fa icon={faTrash} />
                </button>
                <div
                  title="Item saved to database"
                  class="ml-4 cursor-not-allowed"
                  class:text-green-500={trackingHistoryItem.saved}
                >
                  <Fa icon={faFloppyDisk} />
                </div>
              </div>
            {/each}
          </div>
          <div class="flex justify-between mt-3">
            <button
              title={currentTrackingHistoryIndex === 0 ? '' : 'Previous Page'}
              disabled={currentTrackingHistoryIndex === 0}
              class:opacity-50={currentTrackingHistoryIndex === 0}
              class:cursor-not-allowed={currentTrackingHistoryIndex === 0}
              onclick={() => (trackingHistoryIndex -= 1)}
            >
              <Fa icon={faChevronLeft} />
            </button>
            <button
              title={hasNextPage ? 'Next Page' : ''}
              disabled={!hasNextPage}
              class:opacity-50={!hasNextPage}
              class:cursor-not-allowed={!hasNextPage}
              onclick={() => (trackingHistoryIndex += 1)}
            >
              <Fa icon={faChevronRight} />
            </button>
          </div>
        </details>
      {/if}
    </div>
  {/each}
  {#if actionInProgress}
    <div class="tap-highlight-transparent absolute inset-0 bg-black/20"></div>
    <div class="absolute inset-0 flex h-full w-full items-center justify-center text-7xl">
      <Fa icon={faSpinner} spin />
    </div>
  {/if}
</div>
