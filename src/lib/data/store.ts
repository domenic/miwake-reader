import { browser } from '$app/environment';
import {
  ReadingGoalFrequency,
  TrackerAutoPause,
  TrackerSkipThresholdAction
} from '$lib/components/book-reader/book-reading-tracker/tracker-domain';
import { HeatmapDataAggregration } from '$lib/components/statistics/statistics-heatmap/statistics-heatmap';
import {
  defaultStatisticsView,
  type StatisticsView
} from '$lib/components/statistics/statistics-view';
import {
  StatisticsRangeTemplate,
  type BookStatistic,
  StatisticsReadingDataAggregationMode
} from '$lib/components/statistics/statistics-types';
import { BlurMode } from '$lib/data/blur-mode';
import type { UserFont } from '$lib/data/fonts';
import type { MergeMode } from '$lib/data/merge-mode';
import type { ReadingGoal } from '$lib/data/reading-goal';
import { SortDirection, type SortOption } from '$lib/functions/sorting';
import { AutoReplicationType } from '$lib/functions/replication/replication-options';
import { derived } from 'svelte/store';
import { DatabaseService } from './database/books-db/database.service.svelte';
import { createBooksDb } from './database/books-db/factory';
import { FuriganaStyle } from './furigana-style';
import { ImportHTMLFixMode } from './import-html-fix-mode';
import {
  arrayLocalStorageStore,
  booleanLocalStorageStore,
  numberLocalStorageStore,
  objectLocalStorageStore,
  setLocalStorageStore,
  stringLocalStorageStore
} from './internal/persistent-local-storage-store';
import type { TextMarginMode } from './text-margin-mode';
import type { ThemeOption } from './theme-option';
import type { VerticalTextOrientation } from './vertical-text-orientation';
import { ViewMode } from './view-mode';
import type { WritingMode } from './writing-mode';

export const theme$ = stringLocalStorageStore<string>('theme', 'light-theme');
export const customThemes$ = objectLocalStorageStore<Record<string, ThemeOption>>(
  'customThemes',
  {}
);
export const multiplier$ = numberLocalStorageStore('autoScrollMultiplier', 20);
export const fontFamilyGroupOne$ = stringLocalStorageStore<string>(
  'fontFamilyGroupOne',
  'Noto Serif JP'
);
export const fontFamilyGroupTwo$ = stringLocalStorageStore<string>(
  'fontFamilyGroupTwo',
  'Noto Sans JP'
);
export const fontSize$ = numberLocalStorageStore('fontSize', 20);
export const lineHeight$ = numberLocalStorageStore('lineHeight', 1.65);
export const textIndentation$ = numberLocalStorageStore('textIndentation', 0);
export const textMarginValue$ = numberLocalStorageStore('textMarginValue', 0);
export const blurImageMode$ = stringLocalStorageStore<BlurMode>(
  'hideSpoilerImageMode',
  BlurMode.OFF
);
export const furiganaStyle$ = stringLocalStorageStore<FuriganaStyle>(
  'furiganaStyle',
  FuriganaStyle.Default
);
export const writingMode$ = stringLocalStorageStore<WritingMode>('writingMode', 'vertical-rl');
export const enableVerticalFontKerning$ = booleanLocalStorageStore(
  'enableVerticalFontKerning',
  false
);
export const enableFontVPAL$ = booleanLocalStorageStore('enableFontVPAL', false);
export const verticalTextOrientation$ = stringLocalStorageStore<VerticalTextOrientation>(
  'verticalTextOrientation',
  'mixed'
);
export const prioritizeReaderStyles$ = booleanLocalStorageStore('prioritizeReaderStyles', false);
export const enableTextJustification$ = booleanLocalStorageStore('enableTextJustification', false);
export const enableTextWrapPretty$ = booleanLocalStorageStore('enableTextWrapPretty', false);
export const textMarginMode$ = stringLocalStorageStore<TextMarginMode>('textMarginMode', 'auto');
export const enableReaderWakeLock$ = booleanLocalStorageStore('enableReaderWakeLock', false);
export const verticalMode$ = derived(writingMode$, (writingMode) => writingMode === 'vertical-rl');
export const showCharacterCounter$ = booleanLocalStorageStore('showCharacterCounter', true);
export const showPercentage$ = booleanLocalStorageStore('showPercentage', true);
export { simplifyBookTitles$ } from '$lib/data/book-title-settings';
export const showFooterChapterCharacterCounter$ = booleanLocalStorageStore(
  'showFooterChapterCharacterCounter',
  false
);
export const showFooterChapterPercentage$ = booleanLocalStorageStore(
  'showFooterChapterPercentage',
  false
);
export const viewMode$ = stringLocalStorageStore<ViewMode>('viewMode', ViewMode.Paginated);

export const secondDimensionMaxValue$ = numberLocalStorageStore('secondDimensionMaxValue', 0);
export const firstDimensionMargin$ = numberLocalStorageStore('firstDimensionMargin', 0);

export const swipeThreshold$ = numberLocalStorageStore('swipeThreshold', 10);

export const disableWheelNavigation$ = booleanLocalStorageStore('disableWheelNavigation', false);

export const autoPositionOnResize$ = booleanLocalStorageStore('autoPositionOnResize', true);

export const avoidPageBreak$ = booleanLocalStorageStore('avoidPageBreak', false);

export const pauseTrackerOnCustomPointChange$ = booleanLocalStorageStore(
  'pauseTrackerOnCustomPointChange',
  true
);

export const customReadingPointEnabled$ = booleanLocalStorageStore(
  'customReadingPointEnabled',
  false
);

export const selectionToBookmarkEnabled$ = booleanLocalStorageStore(
  'selectionToBookmarkEnabled',
  false
);

export const enableTapEdgeToFlip$ = booleanLocalStorageStore('enableTapEdgeToFlip', false);

export const confirmClose$ = booleanLocalStorageStore('confirmClose', false);

export const manualBookmark$ = booleanLocalStorageStore('manualBookmark', false);

export const autoBookmark$ = booleanLocalStorageStore('autoBookmark', true);

export const autoBookmarkTime$ = numberLocalStorageStore('autoBookmarkTime', 3);

export const pageColumns$ = numberLocalStorageStore('pageColumns', 0);

export const importHTMLFixMode$ = stringLocalStorageStore<ImportHTMLFixMode>(
  'importHTMLFixMode',
  ImportHTMLFixMode.OFF
);

export const restrictImportFixToAnchor$ = booleanLocalStorageStore(
  'restrictImportFixToAnchor',
  true
);

export const cacheStorageData$ = booleanLocalStorageStore('cacheStorageData', false);

export const autoReplication$ = stringLocalStorageStore<AutoReplicationType>(
  'autoReplication',
  AutoReplicationType.All
);

// Renamed from `keepLocalStatisticsOnDeletion` when it grew to also cover
// bookmarks; the old stored value is deliberately not migrated.
export const keepLocalReadingDataOnDeletion$ = booleanLocalStorageStore(
  'keepLocalReadingDataOnDeletion',
  true
);

export const overwriteBookCompletion$ = booleanLocalStorageStore('overwriteBookCompletion', false);

export const startDayHoursForTracker$ = numberLocalStorageStore('startDayHoursForTracker', 0);

export const statisticsEnabled$ = booleanLocalStorageStore('statisticsEnabled', false);

export const statisticsMergeMode$ = stringLocalStorageStore<MergeMode>(
  'statisticsMergeMode',
  'merge'
);

export const readingGoalsMergeMode$ = stringLocalStorageStore<MergeMode>(
  'readingGoalsMergeMode',
  'merge'
);

export const trackerAutoPause$ = stringLocalStorageStore<TrackerAutoPause>(
  'trackerAutoPause',
  TrackerAutoPause.MODERATE
);

export const openTrackerOnCompletion$ = booleanLocalStorageStore('openTrackerOnCompletion', true);

export const addCharactersOnCompletion$ = booleanLocalStorageStore(
  'addCharactersOnCompletion',
  false
);

export const trackerAutostartTime$ = numberLocalStorageStore('trackerAutoStartTime', 0);

export const trackerIdleTime$ = numberLocalStorageStore('trackerIdleTime', 0);

export const trackerForwardSkipThreshold$ = numberLocalStorageStore(
  'trackerForwardSkipThreshold',
  2700
);

export const trackerBackwardSkipThreshold$ = numberLocalStorageStore(
  'trackerBackwardSkipThreshold',
  2700
);

export const trackerSkipThresholdAction$ = stringLocalStorageStore<TrackerSkipThresholdAction>(
  'trackerSkipThresholdAction',
  TrackerSkipThresholdAction.IGNORE
);

export const trackerPopupDetection$ = booleanLocalStorageStore('trackerPopupDetection', false);

export const adjustStatisticsAfterIdleTime$ = booleanLocalStorageStore(
  'adjustStatisticsAfterIdleTime',
  true
);

export const readingGoal$ = objectLocalStorageStore<ReadingGoal>('readingGoal', {
  timeGoal: 0,
  characterGoal: 0,
  goalFrequency: ReadingGoalFrequency.DAILY,
  goalStartDate: '',
  lastGoalModified: Date.now()
});

export const lastBlurredTrackerItems$ = setLocalStorageStore<string>(
  'lastBlurredTrackerItems',
  new Set<string>()
);

export const lastReadingGoalsModified$ = numberLocalStorageStore('lastReadingGoalsModified', 0);

export const lastStatisticsView$ = stringLocalStorageStore<StatisticsView>(
  'lastStatisticsView',
  defaultStatisticsView
);

export const lastStatisticsRangeTemplate$ = stringLocalStorageStore<StatisticsRangeTemplate>(
  'lastStatisticsRangeTemplate',
  StatisticsRangeTemplate.TODAY
);

export const lastStatisticsStartDate$ = stringLocalStorageStore<string>(
  'lastStatisticsStartDate',
  ''
);

export const lastStatisticsEndDate$ = stringLocalStorageStore<string>('lastStatisticsEndDate', '');

export const lastStartDayOfWeek$ = numberLocalStorageStore('lastStartDayOfWeek', 1);

export const lastReadingTimeDataSource$ = stringLocalStorageStore<keyof BookStatistic>(
  'lastReadingTimeDataSource',
  'readingTime'
);

export const lastCharactersDataSource$ = stringLocalStorageStore<keyof BookStatistic>(
  'lastCharactersDataSource',
  'charactersRead'
);

export const lastReadingSpeedDataSource$ = stringLocalStorageStore<keyof BookStatistic>(
  'lastReadingSpeedDataSource',
  'lastReadingSpeed'
);

export const lastPrimaryReadingDataAggregationMode$ =
  stringLocalStorageStore<StatisticsReadingDataAggregationMode>(
    'lastPrimaryReadingDataAggregationMode',
    StatisticsReadingDataAggregationMode.NONE
  );

export const confirmStatisticsDeletion$ = booleanLocalStorageStore(
  'confirmStatisticsDeletion',
  true
);

export const lastStatisticsFilterDateRangeOnly$ = booleanLocalStorageStore(
  'lastStatisticsFilterDateRangeOnly',
  false
);

export const lastReadingDataHeatmapAggregationMode$ =
  stringLocalStorageStore<HeatmapDataAggregration>(
    'lastReadingDataHeatmapAggregationMode',
    HeatmapDataAggregration.ALL_TIME
  );

export const lastReadingGoalsHeatmapAggregationMode$ =
  stringLocalStorageStore<HeatmapDataAggregration>(
    'lastReadingGoalsHeatmapAggregationMode',
    HeatmapDataAggregration.ALL_TIME
  );

export const lastStatisticsSummarySortProperty$ = stringLocalStorageStore<keyof BookStatistic>(
  'lastStatisticsSummarySortProperty',
  'readingTime'
);

export const lastStatisticsSummarySortDirection$ = stringLocalStorageStore<SortDirection>(
  'lastStatisticsSummarySortDirection',
  SortDirection.DESC
);

const db = browser ? createBooksDb() : import('fake-indexeddb/auto').then(() => createBooksDb());

export const database = new DatabaseService(db);

export const booklistSortOptions$ = objectLocalStorageStore<SortOption>('booklistSortOptions', {
  property: 'lastBookOpen',
  direction: SortDirection.DESC
});

export const verticalCustomReadingPosition$ = numberLocalStorageStore(
  'verticalCustomReadingPosition',
  100
);

export const horizontalCustomReadingPosition$ = numberLocalStorageStore(
  'horizontalCustomReadingPosition',
  0
);

export const userFonts$ = arrayLocalStorageStore<UserFont>('userfonts', []);
