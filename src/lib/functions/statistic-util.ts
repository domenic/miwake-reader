import type { BookStatistic } from '$lib/components/statistics/statistics-types';
import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';

export function getDate(referenceDateString: string, dayBoundary = '00:00') {
  const [hours, minutes] = parseDayBoundary(dayBoundary);
  return new Date(
    `${referenceDateString}T${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}:00`
  );
}

export function getDayBoundaryDate(dayBoundary: string, startDate = new Date()) {
  const referenceDate = startDate;
  const targetDate = new Date(referenceDate.getTime());
  const [hours, minutes] = parseDayBoundary(dayBoundary);

  targetDate.setHours(hours, minutes, 0, 0);

  if (referenceDate < targetDate) {
    targetDate.setDate(targetDate.getDate() - 1);
  }

  return targetDate;
}

export function getDateKey(dayBoundary: string, referenceDate = new Date()) {
  return getDateString(getDayBoundaryDate(dayBoundary, referenceDate));
}

export function getPreviousDayKey(
  dayBoundary: string,
  referenceDate = new Date(),
  ignoreDayBoundary = false
) {
  const dayAfter = referenceDate;
  const previousDay = new Date(dayAfter.getTime());
  const currentDayBoundary = new Date(dayAfter.getTime());
  const [hours, minutes] = parseDayBoundary(dayBoundary);

  previousDay.setHours(hours, minutes, 0, 0);
  previousDay.setDate(previousDay.getDate() - 1);
  currentDayBoundary.setHours(hours, minutes, 0, 0);

  if (!ignoreDayBoundary && dayAfter < currentDayBoundary) {
    previousDay.setDate(previousDay.getDate() - 1);
  }

  return getDateString(previousDay);
}

export function advanceDateDays(referenceDate: Date, daysToAdvance = 1) {
  referenceDate.setDate(referenceDate.getDate() + daysToAdvance);

  return { referenceDate, dateString: getDateString(referenceDate) };
}

export function getSecondsToDate(dayBoundary: string, referenceDate = new Date()) {
  const dateObject = referenceDate;
  const targetDate = getDayBoundaryDate(dayBoundary, new Date(dateObject.getTime()));

  return Math.floor((dateObject.getTime() - targetDate.getTime()) / 1000);
}

function parseDayBoundary(dayBoundary: string) {
  const match = /^(?<hours>[01]\d|2[0-3]):(?<minutes>[0-5]\d)$/.exec(dayBoundary);
  return [Number(match?.groups?.hours ?? 0), Number(match?.groups?.minutes ?? 0)] as const;
}

export function getDaysBetween(
  firstDay: Date | undefined,
  secondDay: Date | undefined,
  dayAdjustment = 1
) {
  if (!firstDay || !secondDay) {
    return 0;
  }

  return Math.round((secondDay.getTime() - firstDay.getTime()) / 8.64e7) + dayAdjustment;
}

export function toTimeString(s: number) {
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s - hours * 3600) / 60);
  const seconds = Math.floor(s - hours * 3600 - minutes * 60);

  return `${`${hours}`.padStart(2, '0')}:${`${minutes}`.padStart(2, '0')}:${`${seconds}`.padStart(
    2,
    '0'
  )}`;
}

export function secondsToMinutes(seconds: number) {
  return Math.floor((seconds / 60 + Number.EPSILON) * 100) / 100;
}

export function getDateString(date: Date) {
  return `${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(
    2,
    '0'
  )}-${`${date.getDate()}`.padStart(2, '0')}`;
}

export function getDateTimeString(
  timeInMs: number,
  { includeSeconds = true }: { includeSeconds?: boolean } = {}
) {
  const date = new Date(timeInMs);
  const minuteDateTime = `${getDateString(date)} ${`${date.getHours()}`.padStart(
    2,
    '0'
  )}:${`${date.getMinutes()}`.padStart(2, '0')}`;

  return includeSeconds
    ? `${minuteDateTime}:${`${date.getSeconds()}`.padStart(2, '0')}`
    : minuteDateTime;
}

export function getWeekNumber(referenceDate: number, startDate: number) {
  const days = Math.floor((referenceDate - startDate) / (24 * 60 * 60 * 1000));
  return Math.ceil(days / 7);
}

export function mergeStatistics(
  statistics: BooksDbStatistic[] = [],
  existingStatistics: BooksDbStatistic[] = [],
  isNewOnly = true
) {
  const groupedStatistics = new Map<string, BooksDbStatistic>();

  for (let index = 0, { length } = existingStatistics; index < length; index += 1) {
    const existingStatistic = existingStatistics[index];

    groupedStatistics.set(existingStatistic.dateKey, existingStatistic);
  }

  for (let index = 0, { length } = statistics; index < length; index += 1) {
    const statistic = statistics[index];
    const existingStatistic = groupedStatistics.get(statistic.dateKey);

    if (
      !isNewOnly ||
      !existingStatistic ||
      statistic.lastStatisticModified > existingStatistic.lastStatisticModified
    ) {
      groupedStatistics.set(statistic.dateKey, statistic);
    }
  }

  return [...groupedStatistics.values()];
}

export function updateStatisticToStore(
  mergedStatistics: BooksDbStatistic[],
  fallbackLastModified: number
) {
  const statisticsToStore = mergedStatistics;
  const statisticsWithCompletionFlag = statisticsToStore.filter((entry) => entry.completedBook);

  let statisticWithCompletionFlag = statisticsWithCompletionFlag[0];
  let newStatisticModified = 0;

  for (let index = 1, { length } = statisticsWithCompletionFlag; index < length; index += 1) {
    const entry = statisticsWithCompletionFlag[index];

    statisticWithCompletionFlag =
      entry.lastStatisticModified > statisticWithCompletionFlag.lastStatisticModified
        ? entry
        : statisticWithCompletionFlag;
  }

  for (let index = 0, { length } = statisticsToStore; index < length; index += 1) {
    const statistic = statisticsToStore[index];

    if (
      statisticWithCompletionFlag &&
      statistic.dateKey === statisticWithCompletionFlag.dateKey &&
      statistic.lastStatisticModified === statisticWithCompletionFlag.lastStatisticModified
    ) {
      statistic.completedBook = 1;
    } else {
      delete statistic.completedBook;
      delete statistic.completedData;
    }

    newStatisticModified = Math.max(newStatisticModified, statistic.lastStatisticModified);
    statisticsToStore[index] = statistic;
  }

  statisticsToStore.sort((a, b) => (a.dateKey > b.dateKey ? 1 : -1));

  return { statisticsToStore, newStatisticModified: newStatisticModified || fallbackLastModified };
}

export function getNumberFromObject(data: BookStatistic, key: keyof BookStatistic) {
  return data[key] as number;
}
