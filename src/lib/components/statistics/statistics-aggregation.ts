import { getDefaultStatistic } from '$lib/components/book-reader/book-reading-tracker/tracker-domain';
import {
  type BookStatistic,
  StatisticsReadingDataAggregationMode
} from '$lib/components/statistics/statistics-types';

type StatisticsAggregationKey = 'dateKey' | 'title';

export function aggregateStatistics(
  statistics: readonly BookStatistic[],
  aggregationMode: StatisticsReadingDataAggregationMode
) {
  if (aggregationMode === StatisticsReadingDataAggregationMode.NONE) {
    return [...statistics];
  }

  const aggregationKey =
    aggregationMode === StatisticsReadingDataAggregationMode.DATE ? 'dateKey' : 'title';
  const statisticsByKey = new Map<string, BookStatistic[]>();

  for (const statistic of statistics) {
    const keyValue = statistic[aggregationKey];
    const entries = statisticsByKey.get(keyValue) ?? [];

    entries.push(statistic);
    statisticsByKey.set(keyValue, entries);
  }

  return [...statisticsByKey].map(([key, entries]) =>
    aggregateStatisticEntries(key, aggregationKey, entries)
  );
}

function aggregateStatisticEntries(
  key: string,
  aggregationKey: StatisticsAggregationKey,
  entries: readonly BookStatistic[]
): BookStatistic {
  const statistic: BookStatistic = {
    ...getDefaultStatistic('-', '-'),
    id: key,
    averageReadingTime: 0,
    averageWeightedReadingTime: 0,
    averageCharactersRead: 0,
    averageWeightedCharactersRead: 0,
    averageReadingSpeed: 0,
    averageWeightedReadingSpeed: 0
  };
  let weightedSum = 0;
  let validReadingDays = 0;

  if (aggregationKey === 'title') {
    statistic.title = key;
  } else {
    statistic.dateKey = key;
  }

  for (const entry of entries) {
    statistic.readingTime += entry.readingTime;
    statistic.charactersRead += entry.charactersRead;
    statistic.minReadingSpeed = statistic.minReadingSpeed
      ? Math.min(statistic.minReadingSpeed, entry.minReadingSpeed)
      : entry.minReadingSpeed;
    statistic.altMinReadingSpeed = statistic.altMinReadingSpeed
      ? Math.min(statistic.altMinReadingSpeed, entry.altMinReadingSpeed)
      : statistic.altMinReadingSpeed;
    statistic.maxReadingSpeed = Math.max(statistic.maxReadingSpeed, entry.lastReadingSpeed);
    weightedSum += entry.readingTime * entry.charactersRead;

    if (statistic.readingTime) {
      validReadingDays += 1;
    }
  }

  statistic.lastReadingSpeed = statistic.readingTime
    ? Math.ceil((3600 * statistic.charactersRead) / statistic.readingTime)
    : 0;
  statistic.averageReadingTime = validReadingDays
    ? Math.ceil(statistic.readingTime / validReadingDays)
    : 0;
  statistic.averageWeightedReadingTime = statistic.charactersRead
    ? Math.ceil(weightedSum / statistic.charactersRead)
    : 0;
  statistic.averageCharactersRead = validReadingDays
    ? Math.ceil(statistic.charactersRead / validReadingDays)
    : 0;
  statistic.averageWeightedCharactersRead = statistic.readingTime
    ? Math.ceil(weightedSum / statistic.readingTime)
    : 0;
  statistic.averageReadingSpeed = statistic.averageReadingTime
    ? Math.ceil((3600 * statistic.averageCharactersRead) / statistic.averageReadingTime)
    : 0;
  statistic.averageWeightedReadingSpeed = statistic.averageWeightedReadingTime
    ? Math.ceil(
        (3600 * statistic.averageWeightedCharactersRead) / statistic.averageWeightedReadingTime
      )
    : 0;

  return statistic;
}
