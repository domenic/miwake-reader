<script lang="ts">
  import { browser } from '$app/environment';
  import { faComputer, faPlus, faSpinner } from '@fortawesome/free-solid-svg-icons';
  import {
    TrackerAutoPause,
    TrackerSkipThresholdAction
  } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import ButtonToggleGroup from '$lib/components/button-toggle-group/button-toggle-group.svelte';
  import {
    optionsForToggle,
    type ToggleOption
  } from '$lib/components/button-toggle-group/toggle-option';
  import { ripple } from '$lib/components/ripple';
  import SettingsCustomTheme from '$lib/components/settings/settings-custom-theme.svelte';
  import SettingsDimensionPopover from '$lib/components/settings/settings-dimension-popover.svelte';
  import SettingsFontSelector from '$lib/components/settings/settings-font-selector.svelte';
  import SettingsReadingGoals from '$lib/components/settings/settings-reading-goals.svelte';
  import SettingsItemGroup from '$lib/components/settings/settings-item-group.svelte';
  import SettingsStorageSourceList from '$lib/components/settings/settings-storage-source-list.svelte';
  import SettingsUserFontDialog from '$lib/components/settings/settings-user-font-dialog.svelte';
  import { inputClasses } from '$lib/css-classes';
  import { BlurMode } from '$lib/data/blur-mode';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { LocalFont } from '$lib/data/fonts';
  import { FuriganaStyle } from '$lib/data/furigana-style';
  import { ImportHTMLFixMode } from '$lib/data/import-html-fix-mode';
  import { logger } from '$lib/data/logger';
  import { messageDialog } from '$lib/data/simple-dialogs';
  import { MergeMode } from '$lib/data/merge-mode';
  import { isAppDefault } from '$lib/data/storage/storage-source-manager';
  import { defaultStorageSources } from '$lib/data/storage/storage-types';
  import { isStorageSourceAvailable } from '$lib/data/storage/storage-view';
  import {
    customThemes$,
    database,
    fontFamilyGroupOne$,
    fontFamilyGroupTwo$,
    horizontalCustomReadingPosition$,
    textMarginMode$,
    textMarginValue$,
    theme$,
    verticalCustomReadingPosition$
  } from '$lib/data/store';
  import type { TextMarginMode } from '$lib/data/text-margin-mode';
  import { availableThemes as availableThemesMap } from '$lib/data/theme-option';
  import type { VerticalTextOrientation } from '$lib/data/vertical-text-orientation';
  import { ViewMode } from '$lib/data/view-mode';
  import type { WritingMode } from '$lib/data/writing-mode';
  import { secondsToMinutes } from '$lib/functions/statistic-util';
  import { dummyFn } from '$lib/functions/utils';
  import {
    ReplicationSaveBehavior,
    AutoReplicationType
  } from '$lib/functions/replication/replication-options';
  import { map } from 'rxjs';
  import Fa from 'svelte-fa';

  interface Props {
    selectedTheme: string;
    viewMode: ViewMode;
    fontFamilyGroupOne: string;
    fontFamilyGroupTwo: string;
    fontSize: number;
    lineHeight: number;
    textIndentation: number;
    textMarginValue: number;
    blurImage: boolean;
    blurImageMode: string;
    hideFurigana: boolean;
    furiganaStyle: FuriganaStyle;
    writingMode: WritingMode;
    enableFontKerning: boolean;
    enableFontVPAL: boolean;
    verticalTextOrientation: VerticalTextOrientation;
    prioritizeReaderStyles: boolean;
    enableTextJustification: boolean;
    enableTextWrapPretty: boolean;
    textMarginMode: TextMarginMode;
    enableReaderWakeLock: boolean;
    showCharacterCounter: boolean;
    showPercentage: boolean;
    showFooterChapterCharacterCounter: boolean;
    showFooterChapterPercentage: boolean;
    secondDimensionMaxValue: number;
    firstDimensionMargin: number;
    swipeThreshold: number;
    disableWheelNavigation: boolean;
    autoPositionOnResize: boolean;
    avoidPageBreak: boolean;
    pauseTrackerOnCustomPointChange: boolean;
    customReadingPointEnabled: boolean;
    selectionToBookmarkEnabled: boolean;
    enableTapEdgeToFlip: boolean;
    pageColumns: number;
    storageQuota: string;
    persistentStorage: boolean;
    confirmClose: boolean;
    manualBookmark: boolean;
    autoBookmark: boolean;
    autoBookmarkTime: number;
    activeSettings: string;
    importHTMLFixMode: string;
    restrictImportFixToAnchor: boolean;
    cacheStorageData: boolean;
    autoReplication: string;
    replicationSaveBehavior: string;
    showExternalPlaceholder: boolean;
    keepLocalStatisticsOnDeletion: boolean;
    overwriteBookCompletion: boolean;
    startDayHoursForTracker: number;
    statisticsMergeMode: string;
    readingGoalsMergeMode: string;
    statisticsEnabled: boolean;
    trackerAutoPause: string;
    openTrackerOnCompletion: boolean;
    addCharactersOnCompletion: boolean;
    trackerAutoStartTime: number;
    trackerIdleTime: number;
    trackerForwardSkipThreshold: number;
    trackerBackwardSkipThreshold: number;
    trackerSkipThresholdAction: string;
    trackerPopupDetection: boolean;
    adjustStatisticsAfterIdleTime: boolean;
  }

  let {
    selectedTheme = $bindable(),
    viewMode = $bindable(),
    fontFamilyGroupOne = $bindable(),
    fontFamilyGroupTwo = $bindable(),
    fontSize = $bindable(),
    lineHeight = $bindable(),
    textIndentation = $bindable(),
    textMarginValue = $bindable(),
    blurImage = $bindable(),
    blurImageMode = $bindable(),
    hideFurigana = $bindable(),
    furiganaStyle = $bindable(),
    writingMode = $bindable(),
    enableFontKerning = $bindable(),
    enableFontVPAL = $bindable(),
    verticalTextOrientation = $bindable(),
    prioritizeReaderStyles = $bindable(),
    enableTextJustification = $bindable(),
    enableTextWrapPretty = $bindable(),
    textMarginMode = $bindable(),
    enableReaderWakeLock = $bindable(),
    showCharacterCounter = $bindable(),
    showPercentage = $bindable(),
    showFooterChapterCharacterCounter = $bindable(),
    showFooterChapterPercentage = $bindable(),
    secondDimensionMaxValue = $bindable(),
    firstDimensionMargin = $bindable(),
    swipeThreshold = $bindable(),
    disableWheelNavigation = $bindable(),
    autoPositionOnResize = $bindable(),
    avoidPageBreak = $bindable(),
    pauseTrackerOnCustomPointChange = $bindable(),
    customReadingPointEnabled = $bindable(),
    selectionToBookmarkEnabled = $bindable(),
    enableTapEdgeToFlip = $bindable(),
    pageColumns = $bindable(),
    storageQuota,
    persistentStorage = $bindable(),
    confirmClose = $bindable(),
    manualBookmark = $bindable(),
    autoBookmark = $bindable(),
    autoBookmarkTime = $bindable(),
    activeSettings,
    importHTMLFixMode = $bindable(),
    restrictImportFixToAnchor = $bindable(),
    cacheStorageData = $bindable(),
    autoReplication = $bindable(),
    replicationSaveBehavior = $bindable(),
    showExternalPlaceholder = $bindable(),
    keepLocalStatisticsOnDeletion = $bindable(),
    overwriteBookCompletion = $bindable(),
    startDayHoursForTracker = $bindable(),
    statisticsMergeMode = $bindable(),
    readingGoalsMergeMode = $bindable(),
    statisticsEnabled = $bindable(),
    trackerAutoPause = $bindable(),
    openTrackerOnCompletion = $bindable(),
    addCharactersOnCompletion = $bindable(),
    trackerAutoStartTime = $bindable(),
    trackerIdleTime = $bindable(),
    trackerForwardSkipThreshold = $bindable(),
    trackerBackwardSkipThreshold = $bindable(),
    trackerSkipThresholdAction = $bindable(),
    trackerPopupDetection = $bindable(),
    adjustStatisticsAfterIdleTime = $bindable()
  }: Props = $props();

  let availableThemes = $derived(
    (browser
      ? [...Array.from(availableThemesMap.entries()), ...Object.entries($customThemes$)]
      : Array.from(availableThemesMap.entries())
    ).map(([theme, option]) => ({
      theme,
      option
    }))
  );

  let optionsForTheme = $derived(
    availableThemes.map(({ theme, option }) => ({
      id: theme,
      text: 'ぁあ',
      style: {
        color: option.fontColor,
        'background-color': option.backgroundColor
      },
      thickBorders: true,
      showIcons: true
    }))
  );

  $effect(() => {
    return () => dialogManager.dialogs$.next([]);
  });

  const optionsForFuriganaStyle: ToggleOption<FuriganaStyle>[] = [
    {
      id: FuriganaStyle.Hide,
      text: 'Hide'
    },
    {
      id: FuriganaStyle.Partial,
      text: 'Partial'
    },
    {
      id: FuriganaStyle.Toggle,
      text: 'Toggle'
    },
    {
      id: FuriganaStyle.Full,
      text: 'Full'
    }
  ];

  const optionsForWritingMode: ToggleOption<WritingMode>[] = [
    {
      id: 'horizontal-tb',
      text: 'Horizontal'
    },
    {
      id: 'vertical-rl',
      text: 'Vertical'
    }
  ];

  const optionsForVerticalTextOrientation: ToggleOption<VerticalTextOrientation>[] = [
    {
      id: 'mixed',
      text: 'Mixed'
    },
    {
      id: 'upright',
      text: 'Upright'
    }
  ];

  const optionsForTextMarginMode: ToggleOption<TextMarginMode>[] = [
    {
      id: 'auto',
      text: 'Auto'
    },
    {
      id: 'manual',
      text: 'Manual'
    }
  ];

  const optionsForViewMode: ToggleOption<ViewMode>[] = [
    {
      id: ViewMode.Continuous,
      text: 'Continuous'
    },
    {
      id: ViewMode.Paginated,
      text: 'Paginated'
    }
  ];

  const optionsForBlurMode: ToggleOption<BlurMode>[] = [
    {
      id: BlurMode.ALL,
      text: 'All'
    },
    {
      id: BlurMode.AFTER_TOC,
      text: 'After ToC'
    }
  ];

  const optionsForImportHTMLFixes: ToggleOption<ImportHTMLFixMode>[] = [
    {
      id: ImportHTMLFixMode.OFF,
      text: 'Off'
    },
    {
      id: ImportHTMLFixMode.STANDARD,
      text: 'Standard'
    },
    {
      id: ImportHTMLFixMode.EXTENDED,
      text: 'Extended'
    }
  ];

  const optionsForAutoReplicationType: ToggleOption<AutoReplicationType>[] = [
    {
      id: AutoReplicationType.Off,
      text: 'Off'
    },
    {
      id: AutoReplicationType.Up,
      text: 'Up'
    },
    {
      id: AutoReplicationType.Down,
      text: 'Down'
    },
    {
      id: AutoReplicationType.All,
      text: 'All'
    }
  ];

  const optionsForReplicationSaveBehavior: ToggleOption<ReplicationSaveBehavior>[] = [
    {
      id: ReplicationSaveBehavior.NewOnly,
      text: 'New Only'
    },
    {
      id: ReplicationSaveBehavior.Overwrite,
      text: 'Overwrite'
    }
  ];

  const optionsForTrackerAutoPause: ToggleOption<TrackerAutoPause>[] = [
    {
      id: TrackerAutoPause.OFF,
      text: 'Off'
    },
    {
      id: TrackerAutoPause.MODERATE,
      text: 'Moderate'
    },
    {
      id: TrackerAutoPause.STRICT,
      text: 'Strict'
    }
  ];

  const optionsForTrackerSkipThresholdAction: ToggleOption<TrackerSkipThresholdAction>[] = [
    {
      id: TrackerSkipThresholdAction.IGNORE,
      text: 'Ignore'
    },
    {
      id: TrackerSkipThresholdAction.PAUSE,
      text: 'Pause Tracker'
    }
  ];

  const optionsForMergeMode: ToggleOption<MergeMode>[] = [
    {
      id: MergeMode.MERGE,
      text: 'Merge'
    },
    {
      id: MergeMode.REPLACE,
      text: 'Replace'
    }
  ];

  const storageSources$ = database.storageSourcesChanged$.pipe(
    map((storageSources) => [
      ...defaultStorageSources
        .filter((defaultStorageSource) =>
          isStorageSourceAvailable(defaultStorageSource.type, defaultStorageSource.name, window)
        )
        .map((defaultStorageSource) => ({
          name: defaultStorageSource.name,
          type: defaultStorageSource.type,
          storedInManager: false,
          encryptionDisabled: false,
          data: new ArrayBuffer(0),
          lastSourceModified: 0
        })),
      ...storageSources.filter((storageSource) => !isAppDefault(storageSource.name))
    ])
  );

  let showSpinner = $state(false);

  $effect(() => {
    if ($textMarginMode$ === 'auto') {
      $textMarginValue$ = 0;
    }
  });

  let verticalTextOrientationTooltip = $derived(
    verticalTextOrientation === 'mixed'
      ? 'Rotates the characters of horizontal scripts 90° clockwise'
      : 'Lays out the characters of horizontal scripts naturally (upright), as well as the glyphs for vertical scripts.'
  );
  let autoBookmarkTooltip = $derived(
    `If enabled sets a bookmark after ${autoBookmarkTime} seconds without scrolling/page change`
  );
  let wakeLockSupported = $derived(browser && 'wakeLock' in navigator);
  let verticalMode = $derived(writingMode === 'vertical-rl');
  let fontCacheSupported = $derived(browser && 'caches' in window);
  let furiganaStyleTooltip = $derived.by(() => {
    switch (furiganaStyle) {
      case FuriganaStyle.Hide:
        return 'Always hidden';
      case FuriganaStyle.Toggle:
        return 'Hidden by default, can be toggled on click';
      case FuriganaStyle.Full:
        return 'Hidden by default, show on hover or click';
      default:
        return 'Display furigana as grayed out text';
    }
  });
  let avoidPageBreakTooltip = $derived(
    avoidPageBreak
      ? 'Avoids breaking words/sentences into different pages'
      : 'Allow words/sentences to break into different pages'
  );
  let persistentStorageTooltip = $derived(
    persistentStorage
      ? 'Reader uses higher storage limit for local data'
      : 'Uses lower temporary storage for local data.\nMay require bookmark or notification permissions for enablement'
  );
  let importHTMLFixModeTooltip = $derived.by(() => {
    switch (importHTMLFixMode) {
      case ImportHTMLFixMode.OFF:
        return 'Imports epub files as is';
      case ImportHTMLFixMode.EXTENDED:
        return 'Applies additional fixes for epub imports like removing control characters, replacing html entities etc.';
      default:
        return 'Applies fixes for epub imports like wrong self closing elements etc.';
    }
  });
  let cacheStorageDataTooltip = $derived(
    cacheStorageData
      ? 'Storage data is cached. Saves network traffic/latency but requires to reload current/open a new tab to retrieve data changes'
      : 'Storage data is refetched on every action. May consume more network traffic/latency but ensures current data'
  );
  let replicationSaveBehaviorTooltip = $derived(
    replicationSaveBehavior === ReplicationSaveBehavior.Overwrite
      ? 'Data will always be overwritten'
      : 'Data will only be written if none exist on target, no time data is present or if target data is older'
  );
  let autoReplicationTypeTooltip = $derived.by(() => {
    switch (autoReplication) {
      case AutoReplicationType.Up:
        return 'Updated data will be exported to sync target when reading once per minute';
      case AutoReplicationType.Down:
        return 'Data will be imported from sync target when opening a book';
      case AutoReplicationType.All:
        return 'Data will be synced in both directions';
      default:
        return 'No automatic import/export of data';
    }
  });
  let showExternalPlaceholderToolTip = $derived(
    showExternalPlaceholder
      ? 'Placeholder data for external books is shown in the browser source manager'
      : 'Placeholder data for external books is hidden'
  );

  let startOfDayHours = $derived(`${`${startDayHoursForTracker}`.padStart(2, '0')}:00`);

  let trackerIdleTimeInMin = $state(secondsToMinutes(trackerIdleTime));

  $effect(() => {
    trackerIdleTimeInMin = secondsToMinutes(trackerIdleTime);
  });

  let trackerAutoPauseTooltip = $derived.by(() => {
    switch (trackerAutoPause) {
      case TrackerAutoPause.OFF:
        return 'Tracker does not auto pause except for certain reader events';
      case TrackerAutoPause.STRICT:
        return 'Tracker will auto pause on certain reader events and any kind of site focus loss (e. g. dictionary popup)';
      default:
        return 'Tracker will auto pause on certain reader events and when the reader tab loses focus';
    }
  });

  $effect(() => {
    if ((activeSettings === 'Data' || activeSettings === 'Statistics') && !$storageSources$) {
      database
        .getStorageSources()
        .then((storageSources) => {
          database.storageSourcesChanged$.next(storageSources);
        })
        .catch((error) => {
          logger.error(`Failed to retrieve storage sources: ${error.message}`);
          database.storageSourcesChanged$.next([]);
        });
    }
  });
</script>

<div class="grid grid-cols-1 items-center sm:grid-cols-2 sm:gap-6 lg:md:gap-8 lg:grid-cols-3">
  {#if activeSettings === 'Reader'}
    <div class="lg:col-span-2">
      <SettingsItemGroup title="Theme">
        <ButtonToggleGroup
          options={optionsForTheme}
          bind:selectedOptionId={selectedTheme}
          onedit={(id) =>
            dialogManager.dialogs$.next([
              {
                component: SettingsCustomTheme,
                props: { selectedTheme: id, existingThemes: optionsForTheme }
              }
            ])}
          ondelete={(id) => {
            $theme$ = optionsForTheme[optionsForTheme.length - 2]?.id || 'light-theme';
            delete $customThemes$[id];
            $customThemes$ = { ...$customThemes$ };
          }}
        >
          {#if browser}
            <button
              use:ripple
              class="m-1 rounded-md border-2 border-gray-400 p-2 text-lg"
              onclick={() =>
                dialogManager.dialogs$.next([
                  {
                    component: SettingsCustomTheme,
                    props: { existingThemes: optionsForTheme }
                  }
                ])}
            >
              <Fa icon={faPlus} class="mx-2" />
            </button>
          {/if}
        </ButtonToggleGroup>
      </SettingsItemGroup>
    </div>
    <div class="h-full">
      <SettingsItemGroup title="View mode">
        <ButtonToggleGroup options={optionsForViewMode} bind:selectedOptionId={viewMode} />
      </SettingsItemGroup>
    </div>
    <SettingsItemGroup title="Font family (Group 1)">
      {#snippet header()}
        <div class="flex items-center">
          <SettingsFontSelector
            availableFonts={[
              LocalFont.NOTOSERIFJP,
              LocalFont.KZUDMINCHO,
              LocalFont.GENEI,
              LocalFont.SHIPPORIMINCHO,
              LocalFont.KLEEONE,
              LocalFont.KLEEONESEMIBOLD,
              LocalFont.SERIF
            ]}
            bind:fontValue={fontFamilyGroupOne}
          />
          {#if fontCacheSupported}
            <div
              tabindex="0"
              role="button"
              title="Open Custom Font Dialog"
              onclick={() =>
                dialogManager.dialogs$.next([
                  {
                    component: SettingsUserFontDialog,
                    props: { fontFamily: fontFamilyGroupOne$ }
                  }
                ])}
              onkeyup={dummyFn}
            >
              <Fa icon={faComputer} />
            </div>
          {/if}
        </div>
      {/snippet}
      <input
        type="text"
        class={inputClasses}
        placeholder="Noto Serif JP"
        bind:value={fontFamilyGroupOne}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title="Font family (Group 2)">
      {#snippet header()}
        <div class="flex items-center">
          <SettingsFontSelector
            availableFonts={[LocalFont.NOTOSANSJP, LocalFont.KZUDGOTHIC, LocalFont.SANSSERIF]}
            bind:fontValue={fontFamilyGroupTwo}
          />
          {#if fontCacheSupported}
            <div
              tabindex="0"
              role="button"
              onclick={() =>
                dialogManager.dialogs$.next([
                  {
                    component: SettingsUserFontDialog,
                    props: { fontFamily: fontFamilyGroupTwo$ }
                  }
                ])}
              onkeyup={dummyFn}
            >
              <Fa icon={faComputer} />
            </div>
          {/if}
        </div>
      {/snippet}
      <input
        type="text"
        class={inputClasses}
        placeholder="Noto Sans JP"
        bind:value={fontFamilyGroupTwo}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title="Font size">
      <input type="number" class={inputClasses} step="1" min="1" bind:value={fontSize} />
    </SettingsItemGroup>
    <SettingsItemGroup title="Line Height">
      <input
        type="number"
        class={inputClasses}
        step="0.05"
        min="1"
        bind:value={lineHeight}
        onchange={() => {
          if (!lineHeight || lineHeight < 1) {
            lineHeight = 1.65;
          }
        }}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Paragraph Indentation"
      tooltip="# of rem added as text indentation of new paragraphs"
    >
      <input
        type="number"
        class={inputClasses}
        step=".5"
        min="0"
        bind:value={textIndentation}
        onblur={() => {
          const newValue = Number.parseFloat(`${textIndentation ?? 0}`);

          if (isNaN(newValue) || newValue < 1) {
            textIndentation = 0;
          }
        }}
      />
    </SettingsItemGroup>
    {#if textMarginMode === 'manual'}
      <SettingsItemGroup title="Paragraph Margins" tooltip="# of rem added as margin to paragraphs">
        <input
          type="number"
          class={inputClasses}
          step=".5"
          min="0"
          bind:value={textMarginValue}
          onblur={() => {
            const newValue = Number.parseFloat(`${textMarginValue ?? 0}`);

            if (isNaN(newValue) || newValue < 1) {
              textMarginValue = 0;
            }
          }}
        />
      </SettingsItemGroup>
    {/if}
    <SettingsItemGroup
      title={verticalMode ? 'Reader Left/right margin' : 'Reader Top/bottom margin'}
    >
      {#snippet header()}
        <SettingsDimensionPopover
          isFirstDimension
          isVertical={verticalMode}
          bind:dimensionValue={firstDimensionMargin}
        />
      {/snippet}
      <input
        type="number"
        class={inputClasses}
        step="1"
        min="0"
        bind:value={firstDimensionMargin}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title={verticalMode ? 'Reader Max height' : 'Reader Max width'}>
      {#snippet header()}
        <SettingsDimensionPopover
          isVertical={verticalMode}
          bind:dimensionValue={secondDimensionMaxValue}
        />
      {/snippet}
      <input
        type="number"
        class={inputClasses}
        step="1"
        min="0"
        bind:value={secondDimensionMaxValue}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Swipe Threshold"
      tooltip={'Distance which you need to swipe in order trigger a navigation'}
    >
      <input
        type="number"
        step="1"
        min="10"
        class={inputClasses}
        bind:value={swipeThreshold}
        onblur={() => {
          if (swipeThreshold < 10 || typeof swipeThreshold !== 'number') {
            swipeThreshold = 10;
          }
        }}
      />
    </SettingsItemGroup>
    {#if autoBookmark}
      <SettingsItemGroup title="Auto Bookmark Time" tooltip={'Time in s for Auto Bookmark'}>
        <input
          type="number"
          step="1"
          min="1"
          class={inputClasses}
          bind:value={autoBookmarkTime}
          onblur={() => {
            if (autoBookmarkTime < 1 || typeof autoBookmarkTime !== 'number') {
              autoBookmarkTime = 3;
            }
          }}
        />
      </SettingsItemGroup>
    {/if}
    <SettingsItemGroup title="Writing mode">
      <ButtonToggleGroup options={optionsForWritingMode} bind:selectedOptionId={writingMode} />
    </SettingsItemGroup>
    {#if verticalMode}
      <SettingsItemGroup
        title="Enable Font Kerning"
        tooltip={'Can lead to better visual balance for vertical spacing of text if font and browser supports it'}
      >
        <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={enableFontKerning} />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Enable VPAL"
        tooltip={'Can lead to more natural spacing for vertically laid-out text if font and browser supports it'}
      >
        <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={enableFontVPAL} />
      </SettingsItemGroup>
      <SettingsItemGroup title="Text Orientation" tooltip={verticalTextOrientationTooltip}>
        <ButtonToggleGroup
          options={optionsForVerticalTextOrientation}
          bind:selectedOptionId={verticalTextOrientation}
        />
      </SettingsItemGroup>
    {/if}
    <SettingsItemGroup
      title="Prioritize Reader Styles"
      tooltip={'When enabled the "important" declaration is added to certain rules like margins or justification which makes it more likely to be applied in case of conflicting book styles'}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={prioritizeReaderStyles}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Enable Text Justification"
      tooltip={'When enabled the reader adds styles to justify text content of paragraphs'}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={enableTextJustification}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Enable Pretty Text Wrap"
      tooltip={'When enabled the reader adds the pretty text wrap style to supported browsers'}
    >
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={enableTextWrapPretty} />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Paragraph Margin Mode"
      tooltip={'When set to manual it allows to specify a margin value which should be applied to paragraphs'}
    >
      <ButtonToggleGroup
        options={optionsForTextMarginMode}
        bind:selectedOptionId={textMarginMode}
      />
    </SettingsItemGroup>
    {#if wakeLockSupported}
      <SettingsItemGroup
        title="Enable Screen Lock"
        tooltip={'When enabled the reader site attempts to request a WakeLock that prevents device screens from dimming or locking'}
      >
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={enableReaderWakeLock}
        />
      </SettingsItemGroup>
    {/if}
    <SettingsItemGroup title="Show Character Counter">
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={showCharacterCounter} />
    </SettingsItemGroup>
    <SettingsItemGroup title="Show Percentage">
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={showPercentage} />
    </SettingsItemGroup>
    <SettingsItemGroup title="Show Footer Chapter Characters">
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={showFooterChapterCharacterCounter}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title="Show Footer Chapter Percentage">
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={showFooterChapterPercentage}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title="Disable Wheel Navigation">
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={disableWheelNavigation}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Close Confirmation"
      tooltip={`When enabled asks for confirmation on closing/reloading a reader tab and unsaved changes were detected`}
    >
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={confirmClose} />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Manual Bookmark"
      tooltip={'If enabled current position will not be bookmarked when leaving the reader via menu elements'}
    >
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={manualBookmark} />
    </SettingsItemGroup>
    <SettingsItemGroup title="Auto Bookmark" tooltip={autoBookmarkTooltip}>
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={autoBookmark} />
    </SettingsItemGroup>
    <SettingsItemGroup title="Blur image">
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={blurImage} />
    </SettingsItemGroup>
    {#if blurImage}
      <SettingsItemGroup
        title="Blur Mode"
        tooltip="Determines if all or only images after the table of contents will be blurred"
      >
        <ButtonToggleGroup options={optionsForBlurMode} bind:selectedOptionId={blurImageMode} />
      </SettingsItemGroup>
    {/if}
    <SettingsItemGroup title="Hide furigana">
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={hideFurigana} />
    </SettingsItemGroup>
    {#if hideFurigana}
      <SettingsItemGroup title="Hide furigana style" tooltip={furiganaStyleTooltip}>
        <ButtonToggleGroup
          options={optionsForFuriganaStyle}
          bind:selectedOptionId={furiganaStyle}
        />
      </SettingsItemGroup>
    {/if}
    {#if statisticsEnabled}
      <SettingsItemGroup
        title="Custom Point pauses Tracker"
        tooltip={'When enabled the tracker will auto pause and unpause while setting a custom reading point'}
      >
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={pauseTrackerOnCustomPointChange}
        />
      </SettingsItemGroup>
    {/if}
    {#if viewMode === ViewMode.Continuous}
      <SettingsItemGroup
        title="Custom Reading Point"
        tooltip={'Allows to set a persistent custom point in the reader from which the current progress and bookmark is calculated when enabled'}
      >
        <div class="flex items-center">
          <ButtonToggleGroup
            options={optionsForToggle}
            bind:selectedOptionId={customReadingPointEnabled}
          />
          {#if customReadingPointEnabled}
            <div
              tabindex="0"
              role="button"
              class="ml-4 hover:underline"
              onclick={() => {
                verticalCustomReadingPosition$.next(100);
                horizontalCustomReadingPosition$.next(0);
              }}
              onkeyup={dummyFn}
            >
              Reset Points
            </div>
          {/if}
        </div>
      </SettingsItemGroup>
      <SettingsItemGroup title="Auto position on resize">
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={autoPositionOnResize}
        />
      </SettingsItemGroup>
    {:else}
      <SettingsItemGroup title="Avoid Page Break" tooltip={avoidPageBreakTooltip}>
        <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={avoidPageBreak} />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Selection to Bookmark"
        tooltip={'When enabled bookmarks will be placed to a near paragraph of current/previous selected text instead of page start'}
      >
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={selectionToBookmarkEnabled}
        />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Tap to Flip"
        tooltip="Reserves small margins on the left and right on which you can tap to turn pages"
      >
        <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={enableTapEdgeToFlip} />
      </SettingsItemGroup>
      {#if !verticalMode}
        <SettingsItemGroup title="Page Columns" tooltip="# of text columns rendered">
          <input type="number" class={inputClasses} step="1" min="0" bind:value={pageColumns} />
        </SettingsItemGroup>
      {/if}
    {/if}
  {:else if activeSettings === 'Data'}
    <SettingsItemGroup title="Persistent storage" tooltip={persistentStorageTooltip}>
      <div class="flex items-center">
        <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={persistentStorage} />
        {#if storageQuota}
          <div class="ml-4">{storageQuota}</div>
        {/if}
      </div>
    </SettingsItemGroup>
    <SettingsItemGroup title="Epub Import Fixes" tooltip={importHTMLFixModeTooltip}>
      <ButtonToggleGroup
        options={optionsForImportHTMLFixes}
        bind:selectedOptionId={importHTMLFixMode}
      />
    </SettingsItemGroup>
    {#if importHTMLFixMode !== ImportHTMLFixMode.OFF}
      <SettingsItemGroup
        title="Restrict to Links"
        tooltip="Restricts epub fixes for self closing tags to links only"
      >
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={restrictImportFixToAnchor}
        />
      </SettingsItemGroup>
    {/if}
    <SettingsItemGroup title="Cache Data" tooltip={cacheStorageDataTooltip}>
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={cacheStorageData} />
    </SettingsItemGroup>
    <SettingsItemGroup title="Auto Import/Export" tooltip={autoReplicationTypeTooltip}>
      <ButtonToggleGroup
        options={optionsForAutoReplicationType}
        bind:selectedOptionId={autoReplication}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title="Import/Export Behavior" tooltip={replicationSaveBehaviorTooltip}>
      <ButtonToggleGroup
        options={optionsForReplicationSaveBehavior}
        bind:selectedOptionId={replicationSaveBehavior}
      />
    </SettingsItemGroup>
    <SettingsItemGroup title="Show Placeholder" tooltip={showExternalPlaceholderToolTip}>
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={showExternalPlaceholder}
      />
    </SettingsItemGroup>
    <SettingsStorageSourceList storageSources={$storageSources$} />
  {:else}
    <SettingsItemGroup
      title="Keep Local Data on Deletion"
      tooltip={'Determines if local statistics will be deleted or not when removing a local book copy'}
    >
      <div class="flex items-center">
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={keepLocalStatisticsOnDeletion}
        />
        <div
          tabindex="0"
          role="button"
          class="ml-4 hover:underline"
          onclick={() => {
            showSpinner = true;
            database
              .clearZombieStatistics()
              .catch(({ message }) =>
                messageDialog({
                  title: 'Error',
                  message: `Error clearing zombie statistics: ${message}`
                })
              )
              .finally(() => (showSpinner = false));
          }}
          onkeyup={() => {}}
        >
          Clear Zombie Statistics
        </div>
      </div>
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Overwrite Book Completion"
      tooltip={`Determines if only the first Book Completion will be tracked or if it always updates to the latest one`}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={overwriteBookCompletion}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title={`Start Day Hours: ${startOfDayHours}`}
      tooltip={'Determines at which time a new day starts.\nData before this point will be counted towards the previous day'}
    >
      <input
        type="range"
        step="1"
        min="0"
        max="23"
        class={inputClasses}
        bind:value={startDayHoursForTracker}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Statistics Merge"
      tooltip={`Determines if statistics will be merged entry by entry or replaced completely on a sync`}
    >
      <ButtonToggleGroup
        options={optionsForMergeMode}
        bind:selectedOptionId={statisticsMergeMode}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Reading Goals Merge"
      tooltip={`Determines if reading goals will be merged entry by entry or replaced completely on a sync`}
    >
      <ButtonToggleGroup
        options={optionsForMergeMode}
        bind:selectedOptionId={readingGoalsMergeMode}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Enable Statistics"
      tooltip="Enables the tracker icon in the bottom left corner of the reader which you need to use to start tracking your reading session"
    >
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={statisticsEnabled} />
    </SettingsItemGroup>
    {#if statisticsEnabled}
      <SettingsItemGroup title="Tracker Auto Pause" tooltip={trackerAutoPauseTooltip}>
        <ButtonToggleGroup
          options={optionsForTrackerAutoPause}
          bind:selectedOptionId={trackerAutoPause}
        />
      </SettingsItemGroup>
      <SettingsItemGroup title="Open Tracker on Completion">
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={openTrackerOnCompletion}
        />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Update on Completion"
        tooltip={`Determines if the missing amount of characters between the current position and the book total will be added to the statistics or not`}
      >
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={addCharactersOnCompletion}
        />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Autostart tracker (sec)"
        tooltip={'Time in seconds without a change to the character count after which the tracker will initially auto start (0 = disabled, higher value recommended to avoid racing conditions)'}
      >
        <input
          type="number"
          class={inputClasses}
          step="1"
          min="0"
          bind:value={trackerAutoStartTime}
          onblur={() => {
            const newValue = Number.parseFloat(`${trackerAutoStartTime ?? 0}`);

            if (isNaN(newValue) || newValue < 1) {
              trackerAutoStartTime = 0;
            }
          }}
        />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Idle Time (min)"
        tooltip={'Time in minutes after which the tracker will auto pause without page interaction (0 = disabled, max 12h)'}
      >
        <input
          type="number"
          class={inputClasses}
          step="0.5"
          min="0"
          bind:value={trackerIdleTimeInMin}
          onblur={() => {
            if (!trackerIdleTimeInMin || trackerIdleTimeInMin < 0) {
              trackerIdleTime = 0;
            } else if (trackerIdleTimeInMin > 43200) {
              trackerIdleTime = 900;
            } else {
              trackerIdleTime = Math.floor(trackerIdleTimeInMin * 60);
            }
          }}
        />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Forward Skip Threshold"
        tooltip={'Amount of positive characters passed between a tick after which a threshold action is triggered (0 = disabled)'}
      >
        <input
          type="number"
          class={inputClasses}
          step="1"
          min="0"
          bind:value={trackerForwardSkipThreshold}
          onblur={() => {
            if (trackerForwardSkipThreshold === 0) {
              trackerForwardSkipThreshold = 0;
            } else if (!trackerForwardSkipThreshold || trackerForwardSkipThreshold < 0) {
              trackerForwardSkipThreshold = 2700;
            }
          }}
        />
      </SettingsItemGroup>
      <SettingsItemGroup
        title="Backward Skip Threshold"
        tooltip={'Amount of negative characters passed between a tick after which a threshold action is triggered (0 = disabled)'}
      >
        <input
          type="number"
          class={inputClasses}
          step="1"
          bind:value={trackerBackwardSkipThreshold}
          onblur={() => {
            if (trackerBackwardSkipThreshold < 0) {
              trackerBackwardSkipThreshold = Math.abs(trackerBackwardSkipThreshold);
            } else if (trackerBackwardSkipThreshold === 0) {
              trackerBackwardSkipThreshold = 0;
            } else if (!trackerBackwardSkipThreshold) {
              trackerBackwardSkipThreshold = 2700;
            }
          }}
        />
      </SettingsItemGroup>
      {#if trackerForwardSkipThreshold || trackerBackwardSkipThreshold}
        <SettingsItemGroup
          title="Threshold Action"
          tooltip={`Determines what action will be executed in case a skip threshold was triggered`}
        >
          <ButtonToggleGroup
            options={optionsForTrackerSkipThresholdAction}
            bind:selectedOptionId={trackerSkipThresholdAction}
          />
        </SettingsItemGroup>
      {/if}
      {#if trackerAutoPause !== TrackerAutoPause.OFF}
        <SettingsItemGroup
          title="Dictionary Detection"
          tooltip={`If enabled auto pause is skipped if open yomitan/jpdb-browser-reader was detected - yomitan requires disabled 'Secure Container' settings`}
        >
          <ButtonToggleGroup
            options={optionsForToggle}
            bind:selectedOptionId={trackerPopupDetection}
          />
        </SettingsItemGroup>
      {/if}
      {#if trackerIdleTime > 0}
        <SettingsItemGroup
          title="Rollback Statistics on Idle"
          tooltip={`If enabled attempts to rollback statistics by subtracting the idled time value back from the session`}
        >
          <ButtonToggleGroup
            options={optionsForToggle}
            bind:selectedOptionId={adjustStatisticsAfterIdleTime}
          />
        </SettingsItemGroup>
      {/if}
      <SettingsReadingGoals
        storageSources={$storageSources$}
        onspinner={(value) => (showSpinner = value)}
      />
    {/if}
  {/if}
  {#if showSpinner}
    <div class="tap-highlight-transparent fixed inset-0 bg-black/20"></div>
    <div class="fixed inset-0 flex h-full w-full items-center justify-center text-7xl">
      <Fa icon={faSpinner} spin />
    </div>
  {/if}
</div>
