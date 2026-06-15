import type { BooksDbStatistic } from '$lib/data/database/books-db/versions/books-db';

export interface StatisticsDateChange {
  dateString: string;
  isStartDate: boolean;
}

export interface StatisticsDataSource {
  key: keyof BookStatistic;
  label: string;
}

export interface BookStatistic extends BooksDbStatistic {
  id: string;
  averageReadingTime: number;
  averageWeightedReadingTime: number;
  averageCharactersRead: number;
  averageWeightedCharactersRead: number;
  averageReadingSpeed: number;
  averageWeightedReadingSpeed: number;
}

export enum StatisticsRangeTemplate {
  TODAY = 'Today',
  WEEK = 'This Week',
  MONTH = 'This Month',
  YEAR = 'This Year',
  CUSTOM = 'Custom'
}

export enum StatisticsReadingDataAggregationMode {
  NONE = 'None',
  DATE = 'Date',
  TITLE = 'Title'
}

export const statisticsRangeTemplates = [
  StatisticsRangeTemplate.TODAY,
  StatisticsRangeTemplate.WEEK,
  StatisticsRangeTemplate.MONTH,
  StatisticsRangeTemplate.YEAR,
  StatisticsRangeTemplate.CUSTOM
];

export const readingTimeDataSources: StatisticsDataSource[] = [
  { key: 'readingTime', label: 'Total Time' },
  { key: 'averageReadingTime', label: 'Average Time' },
  { key: 'averageWeightedReadingTime', label: 'Weighted Time' }
];

export const charactersDataSources: StatisticsDataSource[] = [
  { key: 'charactersRead', label: 'Characters' },
  { key: 'averageCharactersRead', label: 'Average Characters' },
  { key: 'averageWeightedCharactersRead', label: 'Weighted Characters' }
];

export const readingSpeedDataSources: StatisticsDataSource[] = [
  { key: 'lastReadingSpeed', label: 'Speed' },
  { key: 'minReadingSpeed', label: 'Min Speed' },
  { key: 'altMinReadingSpeed', label: 'Alt Min Speed' },
  { key: 'maxReadingSpeed', label: 'Max Speed' }
];

export const dateDataSources: StatisticsDataSource[] = [{ key: 'dateKey', label: 'Date' }];

export const titleDataSources: StatisticsDataSource[] = [{ key: 'title', label: 'Book' }];

export const statisticsDataAggregrationModes = [
  StatisticsReadingDataAggregationMode.NONE,
  StatisticsReadingDataAggregationMode.DATE,
  StatisticsReadingDataAggregationMode.TITLE
];
