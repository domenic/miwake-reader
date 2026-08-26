<script lang="ts">
  import { browser } from '$app/environment';
  import type { SettingsApplicabilityDetails } from '$lib/components/settings/settings-applicability.svelte';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SettingsNumberInput from '$lib/components/settings/settings-number-input.svelte';
  import SettingsNumberItem from '$lib/components/settings/settings-number-item.svelte';
  import { createOptionalNumberSetting } from '$lib/components/settings/settings-optional-number.svelte';
  import SettingsRadioItem from '$lib/components/settings/settings-radio-item.svelte';
  import SettingsRestoreDefaults from '$lib/components/settings/settings-restore-defaults.svelte';
  import SettingsSection from '$lib/components/settings/settings-section.svelte';
  import SettingsSegmentedItem from '$lib/components/settings/settings-segmented-item.svelte';
  import SettingsSwitchItem from '$lib/components/settings/settings-switch-item.svelte';
  import {
    readerModeSettingsDefaults,
    readingSettingsDefaults,
    readingSettingsLimits
  } from '$lib/data/settings-defaults';
  import {
    autoBookmark$,
    autoBookmarkTime$,
    avoidPageBreak$,
    confirmClose$,
    enableReaderWakeLock$,
    enableTapEdgeToFlip$,
    firstDimensionMargin$,
    pageColumns$,
    pauseTrackerOnCustomPointChange$,
    savePositionOnExit$,
    secondDimensionMaxValue$,
    selectionToBookmarkEnabled$,
    showCharacterCounter$,
    showFooterChapterCharacterCounter$,
    showFooterChapterPercentage$,
    showPercentage$,
    swipeThreshold$,
    viewMode$,
    writingMode$,
    turnPagesByScrolling$
  } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  const pageMarginOptions = [
    {
      id: false,
      label: 'Automatic',
      description: 'Lets the reader use the available screen space.',
      isDefault: true
    },
    {
      id: true,
      label: 'Custom',
      description: 'Uses the same fixed margin on both sides of the reading area.'
    }
  ];
  const lineLengthOptions = [
    {
      id: false,
      label: 'Fit available space',
      description: 'Does not limit the reading area.',
      isDefault: true
    },
    {
      id: true,
      label: 'Custom',
      description: 'Sets a fixed maximum; the reader still shrinks on smaller screens.'
    }
  ];
  const pageColumnOptions = [
    { id: 0, label: 'Auto' },
    { id: 1, label: '1' },
    { id: 2, label: '2' }
  ];
  const swipeSensitivityLabels = {
    10: 'High',
    40: 'Medium',
    80: 'Low'
  } satisfies Record<(typeof readingSettingsLimits.swipeThresholds)[number], string>;
  const swipeSensitivityOptions = readingSettingsLimits.swipeThresholds.map((id) => ({
    id,
    label: swipeSensitivityLabels[id]
  }));

  const horizontalPagesApplicability = {
    label: 'Horizontal pages',
    description:
      'Applies only when text direction is set to Horizontal and reading flow is set to Pages.'
  } satisfies SettingsApplicabilityDetails;
  const pagesApplicability = {
    label: 'Pages',
    description: 'Applies only when reading flow is set to Pages.'
  } satisfies SettingsApplicabilityDetails;
  const pageMarginSetting = createOptionalNumberSetting(firstDimensionMargin$, {
    activeDefault: readingSettingsLimits.pageMargin.rememberedDefault
  });
  const lineLengthSetting = createOptionalNumberSetting(secondDimensionMaxValue$, {
    activeDefault: readingSettingsLimits.maximumReadingArea.rememberedDefault
  });

  let wakeLockSupported = $derived(browser && 'wakeLock' in navigator);

  function restoreDefaults() {
    $writingMode$ = readerModeSettingsDefaults.writingMode;
    $viewMode$ = readerModeSettingsDefaults.viewMode;

    pageMarginSetting.reset(readingSettingsDefaults.firstDimensionMargin);
    lineLengthSetting.reset(readingSettingsDefaults.secondDimensionMaxValue);

    $pageColumns$ = readingSettingsDefaults.pageColumns;
    $avoidPageBreak$ = readingSettingsDefaults.avoidPageBreak;
    $turnPagesByScrolling$ = readingSettingsDefaults.turnPagesByScrolling;
    $enableTapEdgeToFlip$ = readingSettingsDefaults.enableTapEdgeToFlip;
    $swipeThreshold$ = readingSettingsDefaults.swipeThreshold;
    $enableReaderWakeLock$ = readingSettingsDefaults.enableReaderWakeLock;
    $autoBookmark$ = readingSettingsDefaults.autoBookmark;
    $autoBookmarkTime$ = readingSettingsDefaults.autoBookmarkTime;
    $savePositionOnExit$ = readingSettingsDefaults.savePositionOnExit;
    $confirmClose$ = readingSettingsDefaults.confirmClose;
    $selectionToBookmarkEnabled$ = readingSettingsDefaults.selectionToBookmarkEnabled;
    $pauseTrackerOnCustomPointChange$ = readingSettingsDefaults.pauseTrackerOnCustomPointChange;
    $showCharacterCounter$ = readingSettingsDefaults.showCharacterCounter;
    $showPercentage$ = readingSettingsDefaults.showPercentage;
    $showFooterChapterCharacterCounter$ = readingSettingsDefaults.showFooterChapterCharacterCounter;
    $showFooterChapterPercentage$ = readingSettingsDefaults.showFooterChapterPercentage;
  }
</script>

<svelte:head>
  <title>{formatPageTitle('Reading Settings')}</title>
</svelte:head>

<SettingsSection title="Layout">
  <SettingsRadioItem
    legend="Page margins"
    description="Blank space above and below horizontal text, or to the left and right of vertical text."
    options={pageMarginOptions}
    bind:value={pageMarginSetting.enabled}
  >
    {#snippet optionControl(option, { labelledBy })}
      {#if option}
        <SettingsNumberInput
          id="reading-custom-page-margin"
          bind:value={pageMarginSetting.inputValue}
          unit="px"
          {labelledBy}
          min={readingSettingsLimits.pageMargin.minimum}
          max={readingSettingsLimits.pageMargin.maximum}
          step={readingSettingsLimits.pageMargin.step}
          disabled={!pageMarginSetting.enabled}
        />
      {/if}
    {/snippet}
  </SettingsRadioItem>

  <SettingsRadioItem
    legend="Maximum reading area"
    description="Limits the width of horizontal text or the height of vertical text."
    options={lineLengthOptions}
    bind:value={lineLengthSetting.enabled}
  >
    {#snippet optionControl(option, { labelledBy })}
      {#if option}
        <SettingsNumberInput
          id="reading-custom-maximum"
          bind:value={lineLengthSetting.inputValue}
          unit="px"
          {labelledBy}
          min={readingSettingsLimits.maximumReadingArea.minimum}
          max={readingSettingsLimits.maximumReadingArea.maximum}
          step={readingSettingsLimits.maximumReadingArea.step}
          disabled={!lineLengthSetting.enabled}
        />
      {/if}
    {/snippet}
  </SettingsRadioItem>

  <SettingsSegmentedItem
    label="Text columns"
    description="Auto adds columns as needed to keep each one roughly 1,000 px wide or less."
    applicability={horizontalPagesApplicability}
    options={pageColumnOptions}
    bind:value={$pageColumns$}
  />

  <SettingsSwitchItem
    label="Keep paragraphs on one page"
    description="Avoids splitting a paragraph when possible; this can leave blank space."
    applicability={pagesApplicability}
    bind:checked={$avoidPageBreak$}
  />
</SettingsSection>

<SettingsSection title="Navigation">
  <SettingsSwitchItem
    label="Turn pages by scrolling"
    description="Uses mouse-wheel or trackpad gestures to move between pages."
    applicability={pagesApplicability}
    bind:checked={$turnPagesByScrolling$}
  />
  <SettingsSwitchItem
    label="Tap page edges to turn pages"
    description="Reserves a small area on either edge for page turning."
    applicability={pagesApplicability}
    bind:checked={$enableTapEdgeToFlip$}
  />
  <SettingsSegmentedItem
    label="Swipe sensitivity"
    description="How far a swipe must travel before the page turns."
    applicability={pagesApplicability}
    options={swipeSensitivityOptions}
    bind:value={$swipeThreshold$}
  />

  {#if wakeLockSupported}
    <SettingsSwitchItem
      label="Keep the screen awake while reading"
      description="Prevents this device from dimming or locking while the reader is visible."
      bind:checked={$enableReaderWakeLock$}
    />
  {/if}
</SettingsSection>

<SettingsSection title="Saving your place">
  <SettingsSwitchItem
    label="Save my position while reading"
    description="Updates the bookmark after you stop scrolling or turning pages."
    bind:checked={$autoBookmark$}
  />
  {#if $autoBookmark$}
    <SettingsNumberItem
      label="Save after"
      description="Time without scrolling or turning a page."
      bind:value={$autoBookmarkTime$}
      unit="seconds"
      min={readingSettingsLimits.autoBookmarkTime.minimum}
      max={readingSettingsLimits.autoBookmarkTime.maximum}
      step={readingSettingsLimits.autoBookmarkTime.step}
      inset
    />
  {/if}

  <SettingsSwitchItem
    label="Save my position when leaving"
    description="Updates the bookmark before navigating away from the open book."
    bind:checked={$savePositionOnExit$}
  />
  <SettingsSwitchItem
    label="Warn before leaving with unsaved progress"
    description="Asks before navigating away when your position has changed, and before closing or reloading while syncing is unfinished."
    bind:checked={$confirmClose$}
  />

  <SettingsSwitchItem
    label="Anchor bookmarks near selected text"
    description="Prefers selected text; otherwise uses a set reading position or the start of the visible text."
    applicability={pagesApplicability}
    bind:checked={$selectionToBookmarkEnabled$}
  />
  <SettingsSwitchItem
    label="Pause tracking while setting a reading position"
    description="Excludes time spent placing the reading marker or current reading position from your statistics."
    bind:checked={$pauseTrackerOnCustomPointChange$}
  />
</SettingsSection>

<SettingsSection
  title="Progress footer"
  description="Choose which progress details appear at the bottom of the reader."
>
  <SettingsItem>
    <div class="max-w-full min-w-0 overflow-x-auto">
      <table class="min-w-96 table-fixed text-sm">
        <caption class="sr-only">Progress footer fields</caption>
        <colgroup>
          <col class="w-auto" />
          <col class="w-28" />
          <col class="w-28" />
        </colgroup>
        <thead>
          <tr>
            <td class="border-b border-gray-400/40 p-2"></td>
            <th class="border-b border-gray-400/40 p-2 text-left font-medium" scope="col">
              Characters
            </th>
            <th class="border-b border-gray-400/40 p-2 text-left font-medium" scope="col">
              Percentage
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th class="border-b border-gray-400/40 p-2 text-left font-medium" scope="row">
              Whole book
            </th>
            <td class="border-b border-gray-400/40 p-2">
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label="Show whole-book character count"
                  bind:checked={$showCharacterCounter$}
                /> Show
              </label>
            </td>
            <td class="border-b border-gray-400/40 p-2">
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label="Show whole-book percentage"
                  bind:checked={$showPercentage$}
                /> Show
              </label>
            </td>
          </tr>
          <tr>
            <th class="p-2 text-left font-medium" scope="row">Current chapter</th>
            <td class="p-2">
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label="Show current-chapter character count"
                  bind:checked={$showFooterChapterCharacterCounter$}
                /> Show
              </label>
            </td>
            <td class="p-2">
              <label class="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label="Show current-chapter percentage"
                  bind:checked={$showFooterChapterPercentage$}
                /> Show
              </label>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </SettingsItem>
</SettingsSection>

<SettingsRestoreDefaults
  pageName="Reading"
  description="Returns the settings on this page to their original values without affecting books, bookmarks, or reading data."
  message="This restores the settings shown on this page, including Text direction and Reading flow, to their original values. Your books, bookmarks, and reading data will not be affected."
  onrestore={restoreDefaults}
/>
