<script lang="ts">
  import {
    getDefaultStatistic,
    type TrackingHistory,
    TrackerSkipThresholdAction,
    TrackerAutoPause
  } from '$lib/components/book-reader/book-reading-tracker/tracker-domain';
  import {
    closeTrackerMenu,
    pauseTrackerFor,
    resetTrackerRuntime,
    resumeTrackerFor,
    setTrackerAvailable,
    toggleTrackerPauseByUser,
    trackerStatus
  } from '$lib/components/book-reader/book-reading-tracker/tracker-state.svelte';
  import BookReadingTrackerPanel from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker-panel.svelte';
  import SidebarOverlay from '$lib/components/sidebar-overlay.svelte';
  import type { SectionWithProgress } from '$lib/components/book-reader/book-toc/book-toc';
  import type { AutoScroller } from '$lib/components/book-reader/types';
  import type {
    BooksDbReadingGoal,
    BooksDbStatistic
  } from '$lib/data/database/books-db/versions/books-db';
  import { PAGE_CHANGE } from '$lib/data/events';
  import { logger } from '$lib/data/logger';
  import { getReadingGoalWindow, type ReadingGoal } from '$lib/data/reading-goal';
  import {
    adjustStatisticsAfterIdleTime$,
    database,
    readingGoal$,
    startDayHoursForTracker$,
    trackerAutoPause$,
    trackerBackwardSkipThreshold$,
    trackerForwardSkipThreshold$,
    trackerIdleTime$,
    trackerPopupDetection$,
    trackerSkipThresholdAction$
  } from '$lib/data/store';
  import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
  import {
    getDate,
    getDateKey,
    getDateTimeString,
    getPreviousDayKey,
    getSecondsToDate,
    toTimeString
  } from '$lib/functions/statistic-util';
  import { fireAndForget, filterNotNullAndNotUndefined } from '$lib/functions/utils';
  import { interval, NEVER, switchMap, tap } from 'rxjs';
  import { onDestroy, onMount, tick, untrack } from 'svelte';

  interface Props {
    fontColor: string;
    backgroundColor: string;
    bookTitle: string;
    exploredCharCount: number;
    bookCharCount: number;
    sectionData: SectionWithProgress[];
    frozenPosition: number;
    autoScroller: AutoScroller | undefined;
    onstatisticssaved?: () => void;
    onfreezecurrentlocation?: () => void;
  }

  let {
    fontColor,
    backgroundColor,
    bookTitle,
    exploredCharCount,
    bookCharCount,
    sectionData,
    frozenPosition,
    autoScroller,
    onstatisticssaved,
    onfreezecurrentlocation
  }: Props = $props();

  export async function processStatistics(
    characterDiff: number,
    timeDiff = 1,
    referenceTick = Date.now(),
    flushData = true
  ): Promise<void> {
    const todayDate = new Date();
    const absoluteTimeDiff = Math.abs(timeDiff);
    const isNegativeTimeDiff = timeDiff < 0;
    const referenceDate = new Date(referenceTick);
    const referenceDateKey = getDateKey($startDayHoursForTracker$, referenceDate);
    const lastStatisticModified = referenceDate.getTime();
    const secondsOnDay = getSecondsToDate($startDayHoursForTracker$, referenceDate) || 1;
    const overlappedDay = absoluteTimeDiff > secondsOnDay;
    const timeDiffForToday = overlappedDay ? secondsOnDay : absoluteTimeDiff;
    const dateTimeKey = getDateTimeString(lastStatisticModified);
    const trackerHistory: TrackingHistory[] = [
      {
        id: lastStatisticModified * Math.random(),
        dateKey: referenceDateKey,
        dateTimeKey,
        timeDiff: isNegativeTimeDiff ? -timeDiffForToday : timeDiffForToday,
        characterDiff,
        saved: false
      }
    ];

    todayKey = getDateKey($startDayHoursForTracker$, todayDate);

    if (overlappedDay || referenceDateKey !== todayKey) {
      let otherDayTimeDiff = 0;

      if (overlappedDay) {
        otherDayTimeDiff = isNegativeTimeDiff
          ? -(absoluteTimeDiff - secondsOnDay)
          : absoluteTimeDiff - secondsOnDay;
      } else {
        otherDayTimeDiff = isNegativeTimeDiff ? -timeDiffForToday : timeDiffForToday;
      }

      const otherDayKey = overlappedDay
        ? getPreviousDayKey($startDayHoursForTracker$, referenceDate)
        : referenceDateKey;
      const otherDayStatistics =
        statistics.get(otherDayKey) || getDefaultStatistic(bookTitle, otherDayKey);

      updateStatistic(otherDayStatistics, otherDayTimeDiff, characterDiff, lastStatisticModified);

      statistics.set(otherDayKey, otherDayStatistics);
      statisticsToStore.add(otherDayKey);

      if (overlappedDay) {
        trackerHistory.unshift({
          id: lastStatisticModified * Math.random(),
          dateKey: otherDayStatistics.dateKey,
          dateTimeKey,
          timeDiff: otherDayTimeDiff,
          characterDiff,
          saved: false
        });
      }
    }

    todaysStatistics =
      todaysStatistics.dateKey === todayKey
        ? todaysStatistics
        : statistics.get(todayKey) || getDefaultStatistic(bookTitle, todayKey);

    if (todayKey === referenceDateKey) {
      updateStatistic(
        todaysStatistics,
        isNegativeTimeDiff ? -timeDiffForToday : timeDiffForToday,
        characterDiff,
        lastStatisticModified
      );
    } else {
      updateStatistic(todaysStatistics, 0, 0, lastStatisticModified);
    }

    statistics.set(todayKey, todaysStatistics);
    statisticsToStore.add(todayKey);

    updateStatistic(sessionStatistics, timeDiff, characterDiff, lastStatisticModified);
    updateStatistic(allTimeStatistics, timeDiff, characterDiff, lastStatisticModified);

    for (let index = 0, { length } = trackerHistory; index < length; index += 1) {
      if (historyIndex > 59) {
        historyIndex = 0;
      }

      if (trackingHistory.length < 60) {
        trackingHistory.unshift(trackerHistory[index]);
      } else {
        trackingHistory[historyIndex] = trackerHistory[index];
        trackingHistory.sort((t1, t2) => (t2.dateTimeKey > t1.dateTimeKey ? 1 : -1));
        historyIndex += 1;
      }
    }

    updateTimeToFinishBook();

    if (flushData) await flushUpdates();
  }

  export async function flushUpdates(): Promise<void> {
    if (!statisticsToStore.size) return;

    actionInProgress = true;
    hadError = false;

    const toUpdate: string[] = JSON.parse(JSON.stringify([...statisticsToStore]));
    const itemsToStore = toUpdate
      .map((statisticToStore) => {
        const stat = statistics.get(statisticToStore);
        return stat ? $state.snapshot(stat) : undefined;
      })
      .filter(filterNotNullAndNotUndefined);

    statisticsToStore.clear();

    try {
      await database.storeStatistics(
        bookTitle,
        itemsToStore,
        ReplicationSaveBehavior.Overwrite,
        'merge'
      );

      trackingHistory = trackingHistory.map((item) => {
        const oldItem = item;

        oldItem.saved = toUpdate.some((dateKey) => dateKey === item.dateKey);

        return oldItem;
      });

      onstatisticssaved?.();
    } catch (error: any) {
      // Re-queue so the next flush retries; rethrow so operational
      // callers can decide whether to surface a dialog.
      hadError = true;
      statisticsToStore = new Set([...statisticsToStore, ...toUpdate]);
      logger.error(`Error updating statistics: ${error.message}`);
      throw error;
    } finally {
      actionInProgress = false;
      lastTrackerFlushTime = Date.now();

      if (trackerStatus.menuOpen) {
        updateReadingGoalWindow();
      }
    }
  }

  export function updateCompletedBook(
    completedBookStatistics: BooksDbStatistic,
    oldCompletedBookStatistics?: BooksDbStatistic
  ) {
    bookCompletionStatistics = completedBookStatistics.completedData;

    let statistic = statistics.get(completedBookStatistics.dateKey);

    if (statistic) {
      statistic = {
        ...statistic,
        ...{ completedBook: 1, completedData: bookCompletionStatistics }
      };
      statistics.set(completedBookStatistics.dateKey, statistic);
    } else {
      statistics.set(completedBookStatistics.dateKey, completedBookStatistics);
    }

    if (oldCompletedBookStatistics) {
      statistics.set(oldCompletedBookStatistics.dateKey, oldCompletedBookStatistics);
    }
  }

  let yomiPopover: HTMLElement | null = $state(null);
  let jpdbPopover: HTMLElement | null = $state(null);
  let actionInProgress = $state(false);
  let hadError = $state(false);
  let currentReadingGoalStart = $state('');
  let currentReadingGoalEnd = $state('');
  let remainingTimeInReadingGoalWindow = $state('');
  let currentReadingGoal = $state<ReadingGoal>();
  let currentTimeGoal = $state(0);
  let currentCharacterGoal = $state(0);
  let statistics = new Map<string, BooksDbStatistic>();
  // Snapshot initial values — these are session-start state that diverge as the user reads
  const initSnapshot = untrack(() => ({
    bookTitle,
    todayKey: getDateKey($startDayHoursForTracker$),
    exploredCharCount
  }));
  let todayKey = initSnapshot.todayKey;
  let sessionStatistics = $state(
    getDefaultStatistic(initSnapshot.bookTitle, initSnapshot.todayKey)
  );
  let todaysStatistics = $state(getDefaultStatistic(initSnapshot.bookTitle, initSnapshot.todayKey));
  let allTimeStatistics = $state(
    getDefaultStatistic(initSnapshot.bookTitle, initSnapshot.todayKey)
  );
  let bookCompletionStatistics:
    | Omit<BooksDbStatistic, 'title' | 'lastStatisticModified'>
    | undefined = $state<Omit<BooksDbStatistic, 'title' | 'lastStatisticModified'>>();
  let bookStartDate = $state(initSnapshot.todayKey);
  let timeToFinishBook = $state('N/A');
  let lastExploredCharCount = $state(initSnapshot.exploredCharCount);
  let previousLastExploredCharCount = $state(0);
  let trackingHistory: TrackingHistory[] = $state([]);
  let historyIndex = 0;
  let autoScrollerStatistics = $state<BooksDbStatistic>();
  let lastExploredCharCountScroller = initSnapshot.exploredCharCount;
  let statisticsToStore = $state(new Set<string>());
  let lastTrackerTick = 0;
  let lastTrackerFlushTime = 0;
  let trackerIdleTime = 0;

  const yomiObserver = new MutationObserver(handleYomiMutation);
  const dictionaryObserver = new MutationObserver(handleMutation);

  $effect(() => {
    const paused = trackerStatus.paused;

    return untrack(() => {
      if (paused) {
        trackerIdleTime = 0;
        fireAndForget(flushUpdates());
        return;
      }

      const now = Date.now();
      lastTrackerFlushTime = now;
      lastTrackerTick = now;
      updateLastExploredCharCount();

      const timerId = window.setInterval(processTicks, 1000);
      return () => window.clearInterval(timerId);
    });
  });

  $effect(() => {
    const paused = trackerStatus.paused;
    const idleSeconds = $trackerIdleTime$;

    if (paused || idleSeconds <= 0) return;

    let lastUpdate = 0;
    const updateIdleDeadline = () => {
      const now = Date.now();
      if (now - lastUpdate < 1000) return;
      lastUpdate = now;
      trackerIdleTime = now + idleSeconds * 1000;
    };

    updateIdleDeadline();
    document.addEventListener(PAGE_CHANGE, updateIdleDeadline);
    window.addEventListener('pointermove', updateIdleDeadline);
    document.addEventListener('selectionchange', updateIdleDeadline);

    return () => {
      document.removeEventListener(PAGE_CHANGE, updateIdleDeadline);
      window.removeEventListener('pointermove', updateIdleDeadline);
      document.removeEventListener('selectionchange', updateIdleDeadline);
    };
  });

  let hasReadingGoal = $derived(
    !!($readingGoal$.goalStartDate && todayKey >= $readingGoal$.goalStartDate)
  );

  $effect(() => {
    if (trackerStatus.menuOpen && trackerStatus.pausedOutsideMenu) {
      untrack(() => fireAndForget(updateReadingGoalWindow()));
    }
  });

  $effect(() => {
    const currentAutoScroller = autoScroller;

    if (!currentAutoScroller) {
      autoScrollerStatistics = undefined;
      return;
    }

    const subscription = currentAutoScroller.wasAutoScrollerEnabled$
      .pipe(
        tap((isEnabled) => {
          if (isEnabled) {
            todayKey = getDateKey($startDayHoursForTracker$);
            autoScrollerStatistics = getDefaultStatistic(bookTitle, todayKey);
            lastExploredCharCountScroller = exploredCharCount;
          } else {
            autoScrollerStatistics = undefined;
          }
        }),
        switchMap((isEnabled) => (isEnabled ? interval(1000) : NEVER)),
        tap(() => {
          if (!autoScrollerStatistics) {
            return;
          }

          const diff = exploredCharCount - lastExploredCharCountScroller;

          lastExploredCharCountScroller = exploredCharCount;
          autoScrollerStatistics = {
            ...updateStatistic(autoScrollerStatistics, 1, diff, Date.now())
          };
        })
      )
      .subscribe();

    return () => subscription.unsubscribe();
  });

  $effect(() => {
    if ($trackerAutoPause$ !== TrackerAutoPause.OFF && !yomiPopover) {
      yomiPopover = document.querySelector(
        '.yomichan-popup,.yomichan-float,.yomitan-popup,.yomitan-float'
      );

      if (!yomiPopover) {
        yomiObserver.observe(document.body, { childList: true, subtree: false });
      }
    } else {
      yomiObserver.disconnect();
    }
  });

  $effect(() => {
    if ($trackerAutoPause$ !== TrackerAutoPause.OFF && !$trackerPopupDetection$) {
      if (yomiPopover) {
        dictionaryObserver.observe(yomiPopover, { attributes: true });
      }

      if (jpdbPopover) {
        dictionaryObserver.observe(jpdbPopover, { attributes: true });
      }
    } else {
      dictionaryObserver.disconnect();
    }
  });

  onMount(init);

  onDestroy(() => {
    yomiObserver.disconnect();
    dictionaryObserver.disconnect();
    resetTrackerRuntime();
  });

  function handleYomiMutation() {
    yomiPopover = document.querySelector(
      '.yomichan-popup,.yomichan-float,.yomitan-popup,.yomitan-float'
    );

    if (yomiPopover) {
      yomiObserver.disconnect();
    }
  }

  function handleMutation() {
    if (!jpdbPopover && !yomiPopover) {
      return;
    }

    const isDisplayed = isDictionaryDisplayed();

    if (isDisplayed && !trackerStatus.paused) {
      pauseTrackerFor('dictionary');
    } else if (!isDisplayed) {
      resumeTrackerFor('dictionary');
    }
  }

  function isDictionaryDisplayed() {
    return (
      (yomiPopover && yomiPopover.style.visibility !== 'hidden') ||
      (jpdbPopover && jpdbPopover.style.opacity !== '0')
    );
  }

  function handleBlur() {
    if (
      trackerStatus.paused ||
      $trackerAutoPause$ !== TrackerAutoPause.STRICT ||
      ($trackerPopupDetection$ && isDictionaryDisplayed())
    ) {
      return;
    }

    pauseTrackerFor('window-blur');
  }

  function handleFocus() {
    if (
      !trackerStatus.paused ||
      $trackerAutoPause$ !== TrackerAutoPause.STRICT ||
      (!$trackerPopupDetection$ && isDictionaryDisplayed())
    ) {
      return;
    }

    resumeTrackerFor('window-blur');
  }

  function updateLastExploredCharCount() {
    const referenceCharCount = frozenPosition !== -1 ? frozenPosition : exploredCharCount;

    if (lastExploredCharCount !== referenceCharCount) {
      previousLastExploredCharCount = lastExploredCharCount;
      lastExploredCharCount = referenceCharCount;
    }
  }

  function revertTrackerHistory(historyItem: TrackingHistory) {
    const entry = statistics.get(historyItem.dateKey);

    if (!entry) {
      trackingHistory = trackingHistory.filter((item) => item.id !== historyItem.id);
      return;
    }

    actionInProgress = true;

    const lastStatisticModified = Date.now();

    updateStatistic(
      entry,
      -historyItem.timeDiff,
      -historyItem.characterDiff,
      lastStatisticModified
    );
    updateStatistic(
      sessionStatistics,
      -historyItem.timeDiff,
      -historyItem.characterDiff,
      lastStatisticModified
    );
    updateStatistic(
      allTimeStatistics,
      -historyItem.timeDiff,
      -historyItem.characterDiff,
      lastStatisticModified
    );

    statistics.set(entry.dateKey, entry);
    statisticsToStore.add(entry.dateKey);

    trackingHistory = trackingHistory.map((item) =>
      item.id === historyItem.id
        ? {
            id: historyItem.id,
            dateKey: historyItem.dateKey,
            dateTimeKey: getDateTimeString(lastStatisticModified),
            timeDiff: -historyItem.timeDiff,
            characterDiff: -historyItem.characterDiff,
            saved: false
          }
        : item
    );
    trackingHistory.sort((t1, t2) => (t2.dateTimeKey > t1.dateTimeKey ? 1 : -1));
    sessionStatistics = { ...sessionStatistics };

    updateTimeToFinishBook();
    fireAndForget(flushUpdates());
  }

  function handleVisibilityChange(state: DocumentVisibilityState) {
    if ($trackerAutoPause$ !== TrackerAutoPause.MODERATE) {
      return;
    }

    if (
      state === 'hidden' &&
      !trackerStatus.paused &&
      (!$trackerPopupDetection$ || !isDictionaryDisplayed())
    ) {
      pauseTrackerFor('visibility');
    } else if (state === 'visible' && ($trackerPopupDetection$ || !isDictionaryDisplayed())) {
      resumeTrackerFor('visibility');
    }
  }

  async function init() {
    try {
      todayKey = getDateKey($startDayHoursForTracker$);
      jpdbPopover = document.getElementById('jpdb-popup');

      const statisticsForTitle = await database.getStatisticsForBook(bookTitle);
      const setFirstBookReadResult = await database.setFirstBookRead(
        bookTitle,
        $startDayHoursForTracker$,
        statisticsForTitle[0]
      );

      bookStartDate = setFirstBookReadResult[0] as string;

      if (setFirstBookReadResult[1]) {
        onstatisticssaved?.();
      }

      for (let index = 0, { length } = statisticsForTitle; index < length; index += 1) {
        const statisticEntry = statisticsForTitle[index];

        statistics.set(statisticEntry.dateKey, statisticEntry);

        addToStatistic(allTimeStatistics, statisticEntry);

        if (todayKey === statisticEntry.dateKey) {
          addToStatistic(todaysStatistics, statisticEntry);
        }

        if (statisticEntry.completedBook && statisticEntry.completedData) {
          bookCompletionStatistics = statisticEntry.completedData;
        }
      }

      setTrackerAvailable(true);
    } catch ({ message }: any) {
      logger.error(`Error initializing timer: ${message}`);
    }
  }

  async function updateReadingGoalWindow() {
    todayKey = getDateKey($startDayHoursForTracker$);
    todaysStatistics = statistics.get(todayKey) || getDefaultStatistic(bookTitle, todayKey);

    try {
      await tick();

      let currentClosedReadingGoal: BooksDbReadingGoal | undefined;

      if (!hasReadingGoal) {
        currentClosedReadingGoal = await database.getCurrentClosedReadingGoal(todayKey);

        if (!currentClosedReadingGoal) {
          return;
        }
      }

      currentReadingGoal = currentClosedReadingGoal || $readingGoal$;
      [currentReadingGoalStart, currentReadingGoalEnd, remainingTimeInReadingGoalWindow] =
        getReadingGoalWindow(todayKey, $startDayHoursForTracker$, currentReadingGoal);

      if (
        currentClosedReadingGoal?.goalEndDate &&
        currentClosedReadingGoal.goalEndDate < currentReadingGoalEnd
      ) {
        currentReadingGoalEnd = currentClosedReadingGoal.goalEndDate;

        const adjustedEndDate = getDate(currentReadingGoalEnd, $startDayHoursForTracker$);

        remainingTimeInReadingGoalWindow = toTimeString(
          (adjustedEndDate.getTime() + 8.64e7 - Date.now()) / 1000
        );
      }

      const statisticsForTimeWindow = await database.getStatisticsForTimeWindow(
        currentReadingGoalStart,
        currentReadingGoalEnd
      );

      currentTimeGoal = 0;
      currentCharacterGoal = 0;

      for (let index = 0, { length } = statisticsForTimeWindow; index < length; index += 1) {
        const statistic = statisticsForTimeWindow[index];

        currentTimeGoal += statistic.readingTime;
        currentCharacterGoal += statistic.charactersRead;
      }
    } catch ({ message }: any) {
      logger.error(`Error updating Goal Data: ${message}`);
    }
  }

  function processTicks() {
    const now = Date.now();
    const nowTick = trackerIdleTime ? Math.min(trackerIdleTime, now) : now;
    const trackerIdleTimeReached = trackerIdleTime && nowTick >= trackerIdleTime;
    const elapsed = Math.round((nowTick - lastTrackerTick) / 1000);

    lastTrackerTick = nowTick;

    if (trackerIdleTimeReached) {
      pauseTrackerFor('idle');

      if (frozenPosition === -1) {
        if ($adjustStatisticsAfterIdleTime$) {
          fireAndForget(processStatistics(0, elapsed - $trackerIdleTime$, lastTrackerTick, true));
        } else if (elapsed) {
          fireAndForget(processStatistics(0, elapsed, lastTrackerTick, true));
        }
      }

      return;
    }

    if (frozenPosition === -1) {
      const characterDiff = exploredCharCount - lastExploredCharCount;
      let finalCharacterDiff =
        characterDiff < 0 && Math.abs(characterDiff) > sessionStatistics.charactersRead
          ? -sessionStatistics.charactersRead
          : characterDiff;

      if (
        (finalCharacterDiff > 0 &&
          $trackerForwardSkipThreshold$ &&
          finalCharacterDiff >= $trackerForwardSkipThreshold$) ||
        (finalCharacterDiff < 0 &&
          $trackerBackwardSkipThreshold$ &&
          finalCharacterDiff <= -Math.abs($trackerBackwardSkipThreshold$))
      ) {
        if ($trackerSkipThresholdAction$ === TrackerSkipThresholdAction.PAUSE) {
          pauseTrackerFor('skip-threshold');
          return;
        }
        finalCharacterDiff = 0;
      }

      previousLastExploredCharCount = lastExploredCharCount;
      lastExploredCharCount = exploredCharCount;

      fireAndForget(
        processStatistics(
          finalCharacterDiff,
          elapsed,
          lastTrackerTick,
          now - lastTrackerFlushTime > 10000
        )
      );
    }
  }

  function addToStatistic(statisticObject: BooksDbStatistic, entry: BooksDbStatistic) {
    const statistic = statisticObject;

    statistic.title = entry.title;
    statistic.readingTime += entry.readingTime;
    statistic.charactersRead += entry.charactersRead;
    statistic.lastReadingSpeed = statistic.readingTime
      ? Math.ceil((3600 * statistic.charactersRead) / statistic.readingTime)
      : 0;
    statistic.minReadingSpeed = statistic.minReadingSpeed
      ? Math.min(statistic.minReadingSpeed, statistic.lastReadingSpeed)
      : statistic.lastReadingSpeed;
    statistic.altMinReadingSpeed = statistic.altMinReadingSpeed
      ? Math.min(statistic.altMinReadingSpeed, statistic.lastReadingSpeed)
      : statistic.lastReadingSpeed;
    statistic.maxReadingSpeed = Math.max(statistic.maxReadingSpeed, statistic.lastReadingSpeed);
    statistic.lastStatisticModified = Math.max(
      statistic.lastStatisticModified,
      entry.lastStatisticModified
    );
  }

  function updateStatistic(
    statisticObject: BooksDbStatistic,
    timeDiff: number,
    characterDiff: number,
    lastStatisticModified: number
  ) {
    const statistic = statisticObject;

    statistic.readingTime = Math.max(0, statistic.readingTime + timeDiff);
    statistic.charactersRead = Math.max(0, statistic.charactersRead + characterDiff);
    statistic.lastReadingSpeed = statistic.readingTime
      ? Math.ceil((3600 * statistic.charactersRead) / statistic.readingTime)
      : 0;
    statistic.minReadingSpeed = statistic.minReadingSpeed
      ? Math.min(statistic.minReadingSpeed, statistic.lastReadingSpeed)
      : statistic.lastReadingSpeed;
    statistic.maxReadingSpeed = Math.max(statistic.maxReadingSpeed, statistic.lastReadingSpeed);
    statistic.lastStatisticModified = lastStatisticModified;

    if (characterDiff) {
      statistic.altMinReadingSpeed = statistic.altMinReadingSpeed
        ? Math.min(statistic.altMinReadingSpeed, statistic.lastReadingSpeed)
        : statistic.lastReadingSpeed;
    }

    return statistic;
  }

  function updateTimeToFinishBook() {
    timeToFinishBook = sessionStatistics.lastReadingSpeed
      ? toTimeString(
          Math.max(
            0,
            Math.floor(
              (bookCharCount - exploredCharCount) / (sessionStatistics.lastReadingSpeed / 3600)
            )
          )
        )
      : 'N/A';
  }
</script>

<svelte:window onblur={handleBlur} onfocus={handleFocus} />
<svelte:document onvisibilitychange={() => handleVisibilityChange(document.visibilityState)} />

<SidebarOverlay
  open={trackerStatus.menuOpen}
  onclose={closeTrackerMenu}
  side="left"
  class="z-60 max-w-xl"
  style={`color: ${fontColor}; background-color: ${backgroundColor};`}
>
  <BookReadingTrackerPanel
    {fontColor}
    {backgroundColor}
    {actionInProgress}
    {hadError}
    {currentReadingGoal}
    {currentTimeGoal}
    {currentCharacterGoal}
    {currentReadingGoalStart}
    {currentReadingGoalEnd}
    {remainingTimeInReadingGoalWindow}
    {timeToFinishBook}
    {exploredCharCount}
    {lastExploredCharCount}
    {previousLastExploredCharCount}
    {frozenPosition}
    {trackingHistory}
    {sessionStatistics}
    {todaysStatistics}
    {allTimeStatistics}
    {bookCompletionStatistics}
    {autoScrollerStatistics}
    {bookStartDate}
    {sectionData}
    canSaveStatistics={statisticsToStore.size > 0}
    trackerPaused={trackerStatus.pausedOutsideMenu}
    {onfreezecurrentlocation}
    ontogglepause={toggleTrackerPauseByUser}
    onupdatecurrentlocation={updateLastExploredCharCount}
    onsavestatistics={() => fireAndForget(flushUpdates())}
    onrevertstatistic={revertTrackerHistory}
  />
</SidebarOverlay>
