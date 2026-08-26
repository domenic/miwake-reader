import { TrackerAutoPause, TrackerSkipThresholdAction } from '$lib/data/tracker-domain';
import { BlurMode } from '$lib/data/blur-mode';
import { defaultFonts } from '$lib/data/fonts';
import { FuriganaStyle } from '$lib/data/furigana-style';
import { ImportHTMLFixMode } from '$lib/data/import-html-fix-mode';
import type { TextMarginMode } from '$lib/data/text-margin-mode';
import type { VerticalTextOrientation } from '$lib/data/vertical-text-orientation';
import { ViewMode } from '$lib/data/view-mode';
import type { WritingMode } from '$lib/data/writing-mode';
import { AutoReplicationType } from '$lib/functions/replication/replication-options';

export const readerModeSettingsDefaults = {
  writingMode: 'vertical-rl' as WritingMode,
  viewMode: ViewMode.Paginated
};

export const appearanceSettingsDefaults = {
  simplifyBookTitles: true,
  theme: 'light-theme',
  fontFamilyGroupOne: defaultFonts.serif,
  fontFamilyGroupTwo: defaultFonts['sans-serif'],
  fontSize: 20,
  lineHeight: 1.65,
  textIndentation: 0,
  textMarginMode: 'auto' as TextMarginMode,
  textMarginValue: 0,
  enableTextJustification: false,
  furiganaStyle: FuriganaStyle.Default,
  blurImageMode: BlurMode.OFF,
  prioritizeReaderStyles: false,
  enableTextWrapPretty: false,
  verticalTextOrientation: 'mixed' as VerticalTextOrientation,
  enableFontVPAL: false
};

export const appearanceSettingsLimits = {
  fontSize: { minimum: 1, maximum: 200, step: 1 },
  lineHeight: { minimum: 1, maximum: 5, step: 0.05 },
  textIndentation: { minimum: 0, maximum: 20, step: 0.5 },
  textMarginValue: { minimum: 0, maximum: 20, step: 0.5 }
};

export const readingSettingsDefaults = {
  firstDimensionMargin: 0,
  secondDimensionMaxValue: 0,
  pageColumns: 0,
  avoidPageBreak: false,
  turnPagesByScrolling: true,
  enableTapEdgeToFlip: false,
  swipeThreshold: 10,
  enableReaderWakeLock: false,
  autoBookmark: true,
  autoBookmarkTime: 3,
  savePositionOnExit: true,
  confirmClose: false,
  selectionToBookmarkEnabled: false,
  pauseTrackerOnCustomPointChange: true,
  showCharacterCounter: true,
  showPercentage: true,
  showFooterChapterCharacterCounter: false,
  showFooterChapterPercentage: false
};

export const readingSettingsLimits = {
  pageMargin: { minimum: 1, maximum: 1000, step: 1, rememberedDefault: 24 },
  maximumReadingArea: { minimum: 100, maximum: 4000, step: 10, rememberedDefault: 960 },
  autoBookmarkTime: { minimum: 1, maximum: 300, step: 1 },
  pageColumns: { minimum: 0, maximum: 2 },
  swipeThresholds: [10, 40, 80] as const
};

export const trackingSettingsDefaults = {
  statisticsEnabled: false,
  trackerAutostartTime: 0,
  trackerAutoPause: TrackerAutoPause.MODERATE,
  trackerPopupDetection: false,
  trackerIdleTime: 0,
  adjustStatisticsAfterIdleTime: true,
  openTrackerOnCompletion: true,
  addCharactersOnCompletion: false,
  overwriteBookCompletion: false,
  dayBoundaryTime: '00:00',
  keepLocalReadingDataOnDeletion: true,
  trackerForwardSkipThreshold: 2700,
  trackerBackwardSkipThreshold: 2700,
  trackerSkipThresholdAction: TrackerSkipThresholdAction.IGNORE
};

export const trackingSettingsLimits = {
  autostartTime: { minimum: 1, maximum: 300, step: 1, rememberedDefault: 3 },
  idleTime: { minimum: 30, maximum: 43_200, step: 30, rememberedDefault: 900 },
  skipThreshold: { minimum: 1, step: 1 }
};

export const syncSettingsDefaults = {
  autoReplication: AutoReplicationType.All,
  statisticsMergeMode: 'merge' as const,
  readingGoalsMergeMode: 'merge' as const,
  cacheStorageData: false,
  importHTMLFixMode: ImportHTMLFixMode.OFF,
  restrictImportFixToAnchor: true
};
