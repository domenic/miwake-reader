import { onKeyUpStatisticsTab } from '../../../routes/b/on-keydown-reader';
import { aggregateStatistics } from '$lib/components/statistics/statistics-aggregation';
import type {
  StatisticsDeleteRequest,
  StatisticsEditRequest
} from '$lib/components/statistics/statistics-summary/statistics-summary';
import {
  type BookStatistic,
  type StatisticsDateChange,
  StatisticsReadingDataAggregationMode,
  statisticsRangeTemplates,
  statisticsDataAggregrationModes,
  StatisticsRangeTemplate
} from '$lib/components/statistics/statistics-types';
import type {
  BooksDbBookData,
  BooksDbReadingGoal,
  BooksDbStatistic
} from '$lib/data/database/books-db/versions/books-db';
import { showConfirmDialog } from '$lib/components/confirm-dialog.svelte';
import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
import { logger } from '$lib/data/logger';
import { getDateRangeLabel } from '$lib/data/reading-goal';
import { getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import { userDeleteStatisticEntries, userUpdateStatistic } from '$lib/data/library';
import { StorageDataType, SyncEndpointType } from '$lib/data/storage/storage-types';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import {
  confirmStatisticsDeletion$,
  database,
  lastPrimaryReadingDataAggregationMode$,
  lastStartDayOfWeek$,
  lastStatisticsEndDate$,
  lastStatisticsRangeTemplate$,
  lastStatisticsStartDate$,
  skipKeyDownListener$,
  startDayHoursForTracker$,
  statisticsTabKeybindMap$
} from '$lib/data/store';
import {
  advanceDateDays,
  getDateKey,
  getDateString,
  getNumberFromObject,
  getStartHoursDate,
  secondsToMinutes
} from '$lib/functions/statistic-util';
import { pluralize } from '$lib/functions/utils';
import { escapeHTML } from '$lib/functions/escape-html';
import { japaneseLangIfNeeded } from '$lib/functions/japanese-language';
import pLimit from 'p-limit';
import { untrack } from 'svelte';
import { fromStore } from 'svelte/store';
import { SvelteMap, SvelteSet } from 'svelte/reactivity';

interface SubjectBackedStore<T> {
  subscribe(run: (value: T) => void): { unsubscribe(): void };
  next(value: T): void;
  getValue(): T;
}

interface BookFilterURLState {
  shouldUpdate: boolean;
  bookIds?: number[];
}

function fromSubject<T>(subject: SubjectBackedStore<T>) {
  return fromStore({
    subscribe(run: (value: T) => void) {
      const subscription = subject.subscribe(run);
      return () => subscription.unsubscribe();
    },
    set(value: T) {
      subject.next(value);
    },
    update(updater: (value: T) => T) {
      subject.next(updater(subject.getValue()));
    }
  });
}

function formatJapaneseHTML(value: string) {
  const escapedValue = escapeHTML(value);
  return japaneseLangIfNeeded(value) ? `<span lang="ja">${escapedValue}</span>` : escapedValue;
}

export class StatisticsController {
  #confirmStatisticsDeletion = fromSubject(confirmStatisticsDeletion$);
  #lastPrimaryReadingDataAggregationMode = fromSubject(lastPrimaryReadingDataAggregationMode$);
  #lastStartDayOfWeek = fromSubject(lastStartDayOfWeek$);
  #lastStatisticsEndDate = fromSubject(lastStatisticsEndDate$);
  #lastStatisticsRangeTemplate = fromSubject(lastStatisticsRangeTemplate$);
  #lastStatisticsStartDate = fromSubject(lastStatisticsStartDate$);
  #skipKeyDownListener = fromSubject(skipKeyDownListener$);
  #startDayHoursForTracker = fromSubject(startDayHoursForTracker$);
  #bookIdsByTitle = new SvelteMap<string, number[]>();
  #bookTitlesById = new SvelteMap<number, string>();

  isLoading = $state(true);
  statisticsTitleFilters = $state(new SvelteMap<string, boolean>());
  titlesInStatisticsDateRange = $state(new SvelteSet<string>());
  statisticsData: BookStatistic[] = $state([]);
  statisticsForSelection: BookStatistic[] = $state([]);
  aggregatedStatistics: BookStatistic[] = $state([]);
  readingGoals: BooksDbReadingGoal[] = $state([]);
  actionInProgress = $state(false);
  titleFilterEnabled = $state(false);
  titleFilterIsOpen = $state(false);
  showStatisticsSettings = $state(false);

  statisticsDateRangeLabel = $derived(
    getDateRangeLabel(this.#lastStatisticsStartDate.current, this.#lastStatisticsEndDate.current)
  );

  constructor() {
    $effect(() => {
      const startDayHoursForTracker = this.#startDayHoursForTracker.current;

      if (
        this.statisticsTitleFilters.size &&
        this.#lastPrimaryReadingDataAggregationMode.current &&
        this.#lastStatisticsStartDate.current &&
        this.#lastStatisticsEndDate.current &&
        startDayHoursForTracker !== undefined
      ) {
        untrack(() => this.updateStatisticsData());
      }
    });

    $effect(() => {
      const rangeTemplate = this.#lastStatisticsRangeTemplate.current;
      const startDayOfWeek = this.#lastStartDayOfWeek.current;
      const startDayHoursForTracker = this.#startDayHoursForTracker.current;

      if (rangeTemplate || startDayOfWeek > -1) {
        untrack(() => this.#setSelectedStatisticsDays(getStartHoursDate(startDayHoursForTracker)));
      }
    });
  }

  async init(prefilterBookIds?: readonly number[]) {
    this.titleFilterEnabled = false;

    try {
      const db = await database.db;
      const hasPrefilteredBooks = prefilterBookIds !== undefined;
      const initialTitleFilterSelections = new SvelteMap<string, boolean>();

      const [statistics, readingGoalData, bookData] = await Promise.all([
        db.getAllFromIndex('statistic', 'dateKey'),
        database.getReadingGoals(),
        db.getAll('data')
      ]);
      this.#indexBookFilters(bookData);

      const prefilteredTitles = this.#getTitlesForBookIds(prefilterBookIds);

      this.statisticsData = statistics.map((statistic) => {
        if (statistic.readingTime) {
          initialTitleFilterSelections.set(
            statistic.title,
            !hasPrefilteredBooks || prefilteredTitles.has(statistic.title)
          );
        }

        return {
          ...statistic,
          ...{
            id: `${statistic.title}_${statistic.dateKey}`,
            averageReadingTime: statistic.readingTime,
            averageWeightedReadingTime: statistic.readingTime,
            averageCharactersRead: statistic.charactersRead,
            averageWeightedCharactersRead: statistic.charactersRead,
            averageReadingSpeed: statistic.lastReadingSpeed,
            averageWeightedReadingSpeed: statistic.lastReadingSpeed
          }
        };
      });
      this.readingGoals = readingGoalData;

      this.statisticsTitleFilters = initialTitleFilterSelections;
      this.updateStatisticsData();
    } catch (error) {
      showErrorDialog({ title: 'Error loading statistics', error });
    } finally {
      this.isLoading = false;
      this.titleFilterEnabled = true;
    }
  }

  applyBookFilterIds(bookIds?: readonly number[]) {
    const selectedTitles = this.#getTitlesForBookIds(bookIds);

    for (const title of this.statisticsTitleFilters.keys()) {
      this.statisticsTitleFilters.set(title, bookIds === undefined || selectedTitles.has(title));
    }

    this.updateStatisticsData();
  }

  setTitleFilterSelection(titleToUpdate: string, isSelected: boolean) {
    this.statisticsTitleFilters.set(titleToUpdate, isSelected);
    this.updateStatisticsData();
  }

  setTitleFilterSelectionsForTitles(titlesToUpdate: Iterable<string>, isSelected: boolean) {
    for (const title of titlesToUpdate) {
      if (this.statisticsTitleFilters.has(title)) {
        this.statisticsTitleFilters.set(title, isSelected);
      }
    }

    this.updateStatisticsData();
  }

  getBookFilterURLState(): BookFilterURLState {
    if (!this.statisticsTitleFilters.size) {
      return { shouldUpdate: true };
    }

    const selectedTitles = [...this.statisticsTitleFilters]
      .filter(([, isSelected]) => isSelected)
      .map(([title]) => title);

    if (selectedTitles.length === this.statisticsTitleFilters.size) {
      return { shouldUpdate: true };
    }

    const bookIds = new SvelteSet<number>();

    for (const title of selectedTitles) {
      const titleBookIds = this.#bookIdsByTitle.get(title);

      if (!titleBookIds?.length) {
        return { shouldUpdate: false };
      }

      for (const bookId of titleBookIds) {
        bookIds.add(bookId);
      }
    }

    return { shouldUpdate: true, bookIds: [...bookIds].sort((a, b) => a - b) };
  }

  #indexBookFilters(bookData: BooksDbBookData[]) {
    this.#bookIdsByTitle = new SvelteMap();
    this.#bookTitlesById = new SvelteMap();

    for (const book of bookData) {
      const bookId = book.id;

      if (bookId === undefined) {
        continue;
      }

      this.#bookTitlesById.set(bookId, book.title);

      const bookIds = this.#bookIdsByTitle.get(book.title) ?? [];
      bookIds.push(bookId);
      this.#bookIdsByTitle.set(book.title, bookIds);
    }

    for (const bookIds of this.#bookIdsByTitle.values()) {
      bookIds.sort((a, b) => a - b);
    }
  }

  #getTitlesForBookIds(bookIds?: readonly number[]) {
    const titles = new SvelteSet<string>();

    if (bookIds === undefined) {
      return titles;
    }

    for (const bookId of bookIds) {
      const title = this.#bookTitlesById.get(bookId);

      if (title) {
        titles.add(title);
      }
    }

    return titles;
  }

  handleKeyUp(ev: KeyboardEvent) {
    if (
      this.#skipKeyDownListener.current ||
      ev.altKey ||
      ev.ctrlKey ||
      ev.shiftKey ||
      ev.metaKey ||
      ev.repeat
    ) {
      return;
    }

    const result = onKeyUpStatisticsTab(
      ev,
      statisticsTabKeybindMap$.getValue(),
      () => this.toggleStatisticsRangeTemplate(),
      () => this.toggleStatisticsDataAggregationMode()
    );

    if (!result) return;

    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }

    ev.preventDefault();
  }

  copyStatisticsData(dataKeyToCopy: keyof BookStatistic) {
    const statistics =
      this.#lastPrimaryReadingDataAggregationMode.current ===
      StatisticsReadingDataAggregationMode.TITLE
        ? this.aggregatedStatistics
        : aggregateStatistics(
            this.statisticsForSelection,
            StatisticsReadingDataAggregationMode.TITLE
          );

    const logKey = dataKeyToCopy === 'readingTime' ? 'readtime' : 'reading';
    const dataLines = [`Reading Data for ${this.statisticsDateRangeLabel}\n`];

    for (let index = 0, { length } = statistics; index < length; index += 1) {
      const statistic = statistics[index];
      const loggedValue =
        dataKeyToCopy === 'readingTime'
          ? Math.floor(secondsToMinutes(statistic.readingTime))
          : getNumberFromObject(statistic, dataKeyToCopy);

      if (loggedValue) {
        dataLines.push(`.log ${logKey} ${loggedValue} ${statistic.title}`);
      }
    }

    if (dataLines.length > 1) {
      navigator.clipboard
        .writeText(dataLines.join('\n'))
        .catch((error) => logger.error(`Error writing to clipboard: ${error.message}`));
    }
  }

  async exportStatisticsData(exportAllData: boolean) {
    this.actionInProgress = true;

    try {
      const statisticsDataToExport = new SvelteMap<string, BooksDbStatistic[]>();

      for (let index = 0; index < this.statisticsData.length; index += 1) {
        const {
          title,
          dateKey,
          charactersRead,
          readingTime,
          minReadingSpeed,
          altMinReadingSpeed,
          lastReadingSpeed,
          maxReadingSpeed,
          lastStatisticModified,
          completedBook,
          completedData
        } = this.statisticsData[index];

        if (
          exportAllData ||
          (this.statisticsTitleFilters.get(title) &&
            dateKey >= this.#lastStatisticsStartDate.current &&
            dateKey <= this.#lastStatisticsEndDate.current)
        ) {
          const entries = statisticsDataToExport.get(title) || [];

          entries.push({
            title,
            dateKey,
            charactersRead,
            readingTime,
            minReadingSpeed,
            altMinReadingSpeed,
            lastReadingSpeed,
            maxReadingSpeed,
            lastStatisticModified,
            completedBook,
            completedData
          });

          statisticsDataToExport.set(title, entries);
        }
      }

      const entriesToExport = [...statisticsDataToExport.entries()];
      const backupHandler = getSyncEndpoint(window, SyncEndpointType.BACKUP);
      const exportLimiter = pLimit(1);
      const exportTasks: Promise<void>[] = [];
      const exportScopedSettings = {
        saveBehavior: ReplicationSaveBehavior.NewOnly,
        statisticsMergeMode: 'replace' as const,
        readingGoalsMergeMode: 'replace' as const
      };

      backupHandler.clearData();

      entriesToExport.forEach(([titleToExport, dataToExport]) =>
        exportTasks.push(
          exportLimiter(async () => {
            try {
              const lastStatisticsModified = await database.getLastModifiedForType(
                titleToExport,
                StorageDataType.STATISTICS
              );

              if (dataToExport.length) {
                const scoped = backupHandler.scoped({ title: titleToExport }, exportScopedSettings);
                await scoped.saveStatistics(dataToExport, lastStatisticsModified);
              }
            } catch (error) {
              exportLimiter.clearQueue();
              throw error;
            }
          })
        )
      );

      if (entriesToExport.length) {
        exportTasks.push(exportLimiter(async () => backupHandler.createExportZIP(document, false)));
      }

      await Promise.all(exportTasks).finally(() => backupHandler.clearData());
    } catch (error) {
      showErrorDialog({ title: 'Error exporting statistics', error });
    } finally {
      this.actionInProgress = false;
    }
  }

  deleteStatisticsData(deleteAllData: boolean) {
    const dataList = deleteAllData ? this.statisticsData : this.statisticsForSelection;
    const request: StatisticsDeleteRequest = {
      startDate: deleteAllData ? '' : this.#lastStatisticsStartDate.current,
      endDate: deleteAllData ? '' : this.#lastStatisticsEndDate.current,
      titlesToCheck: new SvelteSet<string>(),
      takeAsIs: true
    };

    for (let index = 0, { length } = dataList; index < length; index += 1) {
      request.titlesToCheck.add(dataList[index].title);
    }

    void this.handleDeleteRequest(request);
  }

  setStatisticsDatesToAllTime() {
    if (!this.statisticsTitleFilters.size) {
      return;
    }

    let startDate = '';

    for (let index = 0, { length } = this.statisticsData; index < length; index += 1) {
      const statistic = this.statisticsData[index];

      if (this.statisticsTitleFilters.get(statistic.title)) {
        startDate = statistic.dateKey;
        break;
      }
    }

    if (!startDate) {
      return;
    }

    for (let index = this.statisticsData.length - 1; index >= 0; index -= 1) {
      const statistic = this.statisticsData[index];

      if (this.statisticsTitleFilters.get(statistic.title)) {
        this.#lastStatisticsStartDate.current = startDate;
        this.#lastStatisticsEndDate.current = statistic.dateKey;
        this.#lastStatisticsRangeTemplate.current = StatisticsRangeTemplate.CUSTOM;
        break;
      }
    }
  }

  handleSelectedStatisticsDateChange({ dateString, isStartDate }: StatisticsDateChange) {
    const referenceDate = getStartHoursDate(this.#startDayHoursForTracker.current);
    const todayKey = getDateKey(this.#startDayHoursForTracker.current, referenceDate);

    this.#lastStatisticsRangeTemplate.current = StatisticsRangeTemplate.CUSTOM;

    if (isStartDate) {
      this.#lastStatisticsStartDate.current = dateString || todayKey;
    } else {
      this.#lastStatisticsEndDate.current = dateString || todayKey;
    }

    if (this.#lastStatisticsStartDate.current > this.#lastStatisticsEndDate.current) {
      const originalStartDate = this.#lastStatisticsStartDate.current;
      const originalEndDate = this.#lastStatisticsEndDate.current;

      this.#lastStatisticsStartDate.current = originalEndDate;
      this.#lastStatisticsEndDate.current = originalStartDate;
    }

    this.#setSelectedStatisticsDays(referenceDate);
  }

  #setSelectedStatisticsDays(
    referenceDate = getStartHoursDate(this.#startDayHoursForTracker.current)
  ) {
    switch (this.#lastStatisticsRangeTemplate.current) {
      case StatisticsRangeTemplate.TODAY: {
        const dateKey = getDateString(referenceDate);

        this.#lastStatisticsStartDate.current = dateKey;
        this.#lastStatisticsEndDate.current = dateKey;
        break;
      }
      case StatisticsRangeTemplate.WEEK: {
        const dayIndex = referenceDate.getDay();

        let dayDiff = 0;

        if (this.#lastStartDayOfWeek.current !== dayIndex) {
          if (!this.#lastStartDayOfWeek.current) {
            dayDiff = -dayIndex;
          } else if (!dayIndex) {
            dayDiff = this.#lastStartDayOfWeek.current - 7;
          } else {
            dayDiff =
              this.#lastStartDayOfWeek.current > dayIndex
                ? this.#lastStartDayOfWeek.current - dayIndex - 7
                : this.#lastStartDayOfWeek.current - dayIndex;
          }
        }

        const { dateString: startDate } = advanceDateDays(referenceDate, dayDiff);
        const { dateString: endDate } = advanceDateDays(referenceDate, 6);

        this.#lastStatisticsStartDate.current = startDate;
        this.#lastStatisticsEndDate.current = endDate;
        break;
      }
      case StatisticsRangeTemplate.MONTH: {
        referenceDate.setDate(1);

        this.#lastStatisticsStartDate.current = getDateString(referenceDate);

        referenceDate.setMonth(referenceDate.getMonth() + 1);

        const { dateString: endDate } = advanceDateDays(referenceDate, -1);

        this.#lastStatisticsEndDate.current = endDate;
        break;
      }
      case StatisticsRangeTemplate.YEAR: {
        referenceDate.setMonth(0);
        referenceDate.setDate(1);

        this.#lastStatisticsStartDate.current = getDateString(referenceDate);

        referenceDate.setFullYear(referenceDate.getFullYear() + 1);

        const { dateString: endDate } = advanceDateDays(referenceDate, -1);

        this.#lastStatisticsEndDate.current = endDate;
        break;
      }
      default:
        break;
    }
  }

  async handleDeleteRequest({
    startDate,
    endDate,
    titlesToCheck,
    takeAsIs
  }: StatisticsDeleteRequest) {
    let titlesToDelete: Set<string> = new SvelteSet<string>();

    this.actionInProgress = true;

    if (takeAsIs) {
      titlesToDelete = titlesToCheck;
    } else {
      for (let index = 0, { length } = this.statisticsForSelection; index < length; index += 1) {
        const statistic = this.statisticsForSelection[index];

        if (
          statistic.dateKey >= startDate &&
          statistic.dateKey <= endDate &&
          (!titlesToCheck.size || titlesToCheck.has(statistic.title))
        ) {
          titlesToDelete.add(statistic.title);
        }
      }
    }

    if (!titlesToDelete.size) {
      this.actionInProgress = false;
      return;
    }

    const titleLabel = pluralize(titlesToDelete.size, 'book');
    let confirmed = true;

    if (this.#confirmStatisticsDeletion.current) {
      const dateRangeMessage = startDate ? ` from ${getDateRangeLabel(startDate, endDate)}` : '';

      confirmed = await showConfirmDialog({
        title: 'Delete data',
        messageHTML: `This will delete data${dateRangeMessage} for ${escapeHTML(
          titleLabel
        )}, which may include start and/or completion data.\n\nDeletion syncs to connected sources when upward sync is enabled.\n\n${escapeHTML(
          titleLabel
        )}:\n${[...titlesToDelete].map(formatJapaneseHTML).join('\n\n')}`,
        confirmLabel: 'Delete',
        danger: true
      });
    }

    if (!confirmed) {
      this.actionInProgress = false;
      return;
    }

    try {
      await userDeleteStatisticEntries([...titlesToDelete], false, startDate, endDate);
    } catch (error) {
      showErrorDialog({ title: 'Error deleting statistics', error });
      this.actionInProgress = false;
      return;
    }

    const filterMap = new SvelteMap<string, boolean>();
    const notDeletedMap = new SvelteMap<string, boolean>();

    this.statisticsData = this.statisticsData.filter((statistic) => {
      if (titlesToDelete.has(statistic.title)) {
        const returnValue = startDate
          ? !(statistic.dateKey >= startDate && statistic.dateKey <= endDate)
          : false;

        if (returnValue || !filterMap.get(statistic.title)) {
          filterMap.set(statistic.title, returnValue);
        }

        return returnValue;
      }

      if (statistic.readingTime) {
        notDeletedMap.set(
          statistic.title,
          this.statisticsTitleFilters.get(statistic.title) || false
        );
      }

      return true;
    });

    const filteredEntries = [...filterMap.entries()];
    const titleFilters = [...notDeletedMap.entries()];
    const newStatisticsTitleFilterData = new SvelteMap<string, boolean>();

    for (let index = 0, { length } = filteredEntries; index < length; index += 1) {
      const [title, hasData] = filteredEntries[index];

      if (hasData) {
        newStatisticsTitleFilterData.set(title, true);
      }
    }

    for (let index = 0, { length } = titleFilters; index < length; index += 1) {
      const [title, isDisplayed] = titleFilters[index];
      newStatisticsTitleFilterData.set(title, isDisplayed);
    }

    this.statisticsTitleFilters = newStatisticsTitleFilterData;

    this.updateStatisticsData();
    this.actionInProgress = false;
  }

  async handleEditRequest({
    dateKey,
    title,
    newReadingTime,
    newCharactersRead,
    resetMinMaxValues
  }: StatisticsEditRequest) {
    this.actionInProgress = true;

    const statisticIndex = this.statisticsData.findIndex(
      (statistic) => statistic.dateKey === dateKey && statistic.title === title
    );
    const statistic = this.statisticsData[statisticIndex];
    const newStatistic: BookStatistic = {
      ...statistic,
      readingTime: newReadingTime,
      averageReadingTime: newReadingTime,
      averageWeightedReadingTime: newReadingTime,
      charactersRead: newCharactersRead,
      averageCharactersRead: newCharactersRead,
      averageWeightedCharactersRead: newCharactersRead,
      lastReadingSpeed: newReadingTime ? Math.ceil((3600 * newCharactersRead) / newReadingTime) : 0,
      lastStatisticModified: Date.now()
    };

    newStatistic.averageReadingSpeed = newStatistic.lastReadingSpeed;
    newStatistic.averageWeightedReadingSpeed = newStatistic.lastReadingSpeed;
    newStatistic.minReadingSpeed =
      newStatistic.minReadingSpeed && !resetMinMaxValues
        ? Math.min(newStatistic.minReadingSpeed, newStatistic.lastReadingSpeed)
        : newStatistic.lastReadingSpeed;
    newStatistic.maxReadingSpeed = resetMinMaxValues
      ? newStatistic.lastReadingSpeed
      : Math.max(newStatistic.maxReadingSpeed, newStatistic.lastReadingSpeed);

    if (newCharactersRead || resetMinMaxValues) {
      newStatistic.altMinReadingSpeed =
        newStatistic.altMinReadingSpeed && !resetMinMaxValues
          ? Math.min(newStatistic.altMinReadingSpeed, newStatistic.lastReadingSpeed)
          : newStatistic.lastReadingSpeed;
    }

    const confirmed = await showConfirmDialog({
      title: 'Update data',
      messageHTML: `This will update the data for ${formatJapaneseHTML(title)} on ${escapeHTML(
        dateKey
      )}.\n\nTime: ${secondsToMinutes(statistic.readingTime)} min => ${secondsToMinutes(
        newReadingTime
      )} min\nCharacters: ${statistic.charactersRead} => ${newCharactersRead}\nSpeed: ${
        statistic.lastReadingSpeed
      } / h => ${newStatistic.lastReadingSpeed} / h\nMin Speed: ${
        statistic.minReadingSpeed
      } / h => ${newStatistic.minReadingSpeed} / h\nAlt Min Speed: ${
        statistic.altMinReadingSpeed
      } / h => ${newStatistic.altMinReadingSpeed} / h\nMax Speed: ${
        statistic.maxReadingSpeed
      } / h => ${newStatistic.maxReadingSpeed} / h`,
      confirmLabel: 'Update'
    });

    if (!confirmed) {
      this.actionInProgress = false;
      return;
    }

    try {
      await userUpdateStatistic(newStatistic);
      this.statisticsData[statisticIndex] = { ...statistic, ...newStatistic };
      this.updateStatisticsData();
    } catch (error) {
      showErrorDialog({ title: 'Error updating statistic', error });
    } finally {
      this.actionInProgress = false;
    }
  }

  toggleStatisticsRangeTemplate() {
    let nextIndex =
      statisticsRangeTemplates.findIndex(
        (statisticsRangeTemplate) =>
          this.#lastStatisticsRangeTemplate.current === statisticsRangeTemplate
      ) + 1;

    if (nextIndex >= statisticsRangeTemplates.length - 1) {
      nextIndex = 0;
    }

    this.#lastStatisticsRangeTemplate.current = statisticsRangeTemplates[nextIndex];
  }

  toggleStatisticsDataAggregationMode() {
    let nextIndex =
      statisticsDataAggregrationModes.findIndex(
        (mode) => this.#lastPrimaryReadingDataAggregationMode.current === mode
      ) + 1;

    if (nextIndex > statisticsDataAggregrationModes.length - 1) {
      nextIndex = 0;
    }

    this.#lastPrimaryReadingDataAggregationMode.current =
      statisticsDataAggregrationModes[nextIndex];
  }

  updateStatisticsData() {
    const newTitleFilterForStatisticsSet = new SvelteSet<string>();

    this.statisticsForSelection = this.statisticsData.filter((statistic) =>
      this.#filterStatisticsForSelection(statistic, newTitleFilterForStatisticsSet)
    );
    this.titlesInStatisticsDateRange = newTitleFilterForStatisticsSet;
    this.aggregatedStatistics = aggregateStatistics(
      this.statisticsForSelection,
      this.#lastPrimaryReadingDataAggregationMode.current
    );
  }

  #filterStatisticsForSelection(
    statistic: BookStatistic,
    newTitleFilterForStatisticsSet: SvelteSet<string>
  ) {
    const isInDateRange =
      statistic.readingTime &&
      statistic.dateKey >= this.#lastStatisticsStartDate.current &&
      statistic.dateKey <= this.#lastStatisticsEndDate.current;

    if (isInDateRange) {
      newTitleFilterForStatisticsSet.add(statistic.title);
    }

    return isInDateRange && this.statisticsTitleFilters.get(statistic.title);
  }
}
