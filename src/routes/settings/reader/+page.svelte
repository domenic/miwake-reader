<script lang="ts">
  import { browser } from '$app/environment';
  import { faComputer, faPlus } from '@fortawesome/free-solid-svg-icons';
  import { TrackerAutoPause } from '$lib/components/book-reader/book-reading-tracker/book-reading-tracker';
  import ButtonToggleGroup from '$lib/components/button-toggle-group/button-toggle-group.svelte';
  import {
    optionsForToggle,
    type ToggleOption
  } from '$lib/components/button-toggle-group/toggle-option';
  import { ripple } from '$lib/components/ripple';
  import { showThemeEditorDialog } from '$lib/components/settings/theme-editor-dialog-content.svelte';
  import SettingsDimensionPopover from '$lib/components/settings/settings-dimension-popover.svelte';
  import SettingsFontSelector from '$lib/components/settings/settings-font-selector.svelte';
  import SettingsItemGroup from '$lib/components/settings/settings-item-group.svelte';
  import SettingsUserFontDialog from '$lib/components/settings/settings-user-font-dialog.svelte';
  import { inputClasses } from '$lib/css-classes';
  import { BlurMode } from '$lib/data/blur-mode';
  import { dialogManager } from '$lib/data/dialog-manager';
  import { LocalFont } from '$lib/data/fonts';
  import { FuriganaStyle, furiganaStyleLabels } from '$lib/data/furigana-style';
  import {
    customThemes$,
    fontFamilyGroupOne$,
    fontFamilyGroupTwo$,
    horizontalCustomReadingPosition$,
    textMarginMode$,
    textMarginValue$,
    theme$,
    verticalCustomReadingPosition$,
    autoBookmark$,
    autoBookmarkTime$,
    autoPositionOnResize$,
    avoidPageBreak$,
    customReadingPointEnabled$,
    disableWheelNavigation$,
    enableFontVPAL$,
    enableReaderWakeLock$,
    enableTapEdgeToFlip$,
    enableTextJustification$,
    enableTextWrapPretty$,
    enableVerticalFontKerning$,
    firstDimensionMargin$,
    fontSize$,
    furiganaStyle$,
    hideSpoilerImage$,
    lineHeight$,
    pageColumns$,
    pauseTrackerOnCustomPointChange$,
    prioritizeReaderStyles$,
    secondDimensionMaxValue$,
    selectionToBookmarkEnabled$,
    showCharacterCounter$,
    showFooterChapterCharacterCounter$,
    showFooterChapterPercentage$,
    showPercentage$,
    statisticsEnabled$,
    swipeThreshold$,
    textIndentation$,
    verticalTextOrientation$,
    viewMode$,
    writingMode$,
    hideSpoilerImageMode$,
    confirmClose$,
    manualBookmark$
  } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import type { TextMarginMode } from '$lib/data/text-margin-mode';
  import { availableThemes as availableThemesMap } from '$lib/data/theme-option';
  import type { VerticalTextOrientation } from '$lib/data/vertical-text-orientation';
  import { ViewMode } from '$lib/data/view-mode';
  import type { WritingMode } from '$lib/data/writing-mode';
  import { dummyFn } from '$lib/functions/utils';
  import Fa from 'svelte-fa';

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
    FuriganaStyle.Default,
    FuriganaStyle.Dim,
    FuriganaStyle.Toggle,
    FuriganaStyle.Hide
  ].map((id) => ({ id, text: furiganaStyleLabels[id] }));

  const optionsForWritingMode: ToggleOption<WritingMode>[] = [
    { id: 'horizontal-tb', text: 'Horizontal' },
    { id: 'vertical-rl', text: 'Vertical' }
  ];

  const optionsForVerticalTextOrientation: ToggleOption<VerticalTextOrientation>[] = [
    { id: 'mixed', text: 'Mixed' },
    { id: 'upright', text: 'Upright' }
  ];

  const optionsForTextMarginMode: ToggleOption<TextMarginMode>[] = [
    { id: 'auto', text: 'Auto' },
    { id: 'manual', text: 'Manual' }
  ];

  const optionsForViewMode: ToggleOption<ViewMode>[] = [
    { id: ViewMode.Continuous, text: 'Continuous' },
    { id: ViewMode.Paginated, text: 'Paginated' }
  ];

  const optionsForBlurMode: ToggleOption<BlurMode>[] = [
    { id: BlurMode.ALL, text: 'All' },
    { id: BlurMode.AFTER_TOC, text: 'After ToC' }
  ];

  $effect(() => {
    if ($textMarginMode$ === 'auto') {
      $textMarginValue$ = 0;
    }
  });

  let verticalTextOrientationTooltip = $derived(
    $verticalTextOrientation$ === 'mixed'
      ? 'Rotates the characters of horizontal scripts 90° clockwise'
      : 'Lays out the characters of horizontal scripts naturally (upright), as well as the glyphs for vertical scripts.'
  );
  let autoBookmarkTooltip = $derived(
    `If enabled sets a bookmark after ${$autoBookmarkTime$} seconds without scrolling/page change`
  );
  let wakeLockSupported = $derived(browser && 'wakeLock' in navigator);
  let verticalMode = $derived($writingMode$ === 'vertical-rl');
  let fontCacheSupported = $derived(browser && 'caches' in window);
  let furiganaStyleTooltip = $derived.by(() => {
    switch ($furiganaStyle$) {
      case FuriganaStyle.Default:
        return 'Show furigana as-is from the book';
      case FuriganaStyle.Dim:
        return 'Dimmed, full color on hover or click';
      case FuriganaStyle.Toggle:
        return 'Hidden, revealed on hover, toggled on click';
      case FuriganaStyle.Hide:
        return 'Always hidden';
      default:
        return '';
    }
  });
  let avoidPageBreakTooltip = $derived(
    $avoidPageBreak$
      ? 'Avoids breaking words/sentences into different pages'
      : 'Allow words/sentences to break into different pages'
  );
</script>

<svelte:head>
  <title>{formatPageTitle('Reader Settings')}</title>
</svelte:head>

<div class="grid grid-cols-1 items-center sm:grid-cols-2 sm:gap-6 lg:gap-8 lg:grid-cols-3">
  <div class="lg:col-span-2">
    <SettingsItemGroup title="Theme">
      <ButtonToggleGroup
        options={optionsForTheme}
        bind:selectedOptionId={$theme$}
        onedit={(id) =>
          showThemeEditorDialog({ selectedTheme: id, existingThemes: optionsForTheme })}
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
            onclick={() => showThemeEditorDialog({ existingThemes: optionsForTheme })}
          >
            <Fa icon={faPlus} class="mx-2" />
          </button>
        {/if}
      </ButtonToggleGroup>
    </SettingsItemGroup>
  </div>
  <div class="h-full">
    <SettingsItemGroup title="View mode">
      <ButtonToggleGroup options={optionsForViewMode} bind:selectedOptionId={$viewMode$} />
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
          bind:fontValue={$fontFamilyGroupOne$}
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
      bind:value={$fontFamilyGroupOne$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup title="Font family (Group 2)">
    {#snippet header()}
      <div class="flex items-center">
        <SettingsFontSelector
          availableFonts={[LocalFont.NOTOSANSJP, LocalFont.KZUDGOTHIC, LocalFont.SANSSERIF]}
          bind:fontValue={$fontFamilyGroupTwo$}
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
      bind:value={$fontFamilyGroupTwo$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup title="Font size">
    <input type="number" class={inputClasses} step="1" min="1" bind:value={$fontSize$} />
  </SettingsItemGroup>
  <SettingsItemGroup title="Line Height">
    <input
      type="number"
      class={inputClasses}
      step="0.05"
      min="1"
      bind:value={$lineHeight$}
      onchange={() => {
        if (!$lineHeight$ || $lineHeight$ < 1) {
          $lineHeight$ = 1.65;
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
      bind:value={$textIndentation$}
      onblur={() => {
        const newValue = Number.parseFloat(`${$textIndentation$ ?? 0}`);

        if (isNaN(newValue) || newValue < 1) {
          $textIndentation$ = 0;
        }
      }}
    />
  </SettingsItemGroup>
  {#if $textMarginMode$ === 'manual'}
    <SettingsItemGroup title="Paragraph Margins" tooltip="# of rem added as margin to paragraphs">
      <input
        type="number"
        class={inputClasses}
        step=".5"
        min="0"
        bind:value={$textMarginValue$}
        onblur={() => {
          const newValue = Number.parseFloat(`${$textMarginValue$ ?? 0}`);

          if (isNaN(newValue) || newValue < 1) {
            $textMarginValue$ = 0;
          }
        }}
      />
    </SettingsItemGroup>
  {/if}
  <SettingsItemGroup title={verticalMode ? 'Reader Left/right margin' : 'Reader Top/bottom margin'}>
    {#snippet header()}
      <SettingsDimensionPopover
        isFirstDimension
        isVertical={verticalMode}
        bind:dimensionValue={$firstDimensionMargin$}
      />
    {/snippet}
    <input
      type="number"
      class={inputClasses}
      step="1"
      min="0"
      bind:value={$firstDimensionMargin$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup title={verticalMode ? 'Reader Max height' : 'Reader Max width'}>
    {#snippet header()}
      <SettingsDimensionPopover
        isVertical={verticalMode}
        bind:dimensionValue={$secondDimensionMaxValue$}
      />
    {/snippet}
    <input
      type="number"
      class={inputClasses}
      step="1"
      min="0"
      bind:value={$secondDimensionMaxValue$}
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
      bind:value={$swipeThreshold$}
      onblur={() => {
        if ($swipeThreshold$ < 10 || typeof $swipeThreshold$ !== 'number') {
          $swipeThreshold$ = 10;
        }
      }}
    />
  </SettingsItemGroup>
  {#if $autoBookmark$}
    <SettingsItemGroup title="Auto Bookmark Time" tooltip={'Time in s for Auto Bookmark'}>
      <input
        type="number"
        step="1"
        min="1"
        class={inputClasses}
        bind:value={$autoBookmarkTime$}
        onblur={() => {
          if ($autoBookmarkTime$ < 1 || typeof $autoBookmarkTime$ !== 'number') {
            $autoBookmarkTime$ = 3;
          }
        }}
      />
    </SettingsItemGroup>
  {/if}
  <SettingsItemGroup title="Writing mode">
    <ButtonToggleGroup options={optionsForWritingMode} bind:selectedOptionId={$writingMode$} />
  </SettingsItemGroup>
  {#if verticalMode}
    <SettingsItemGroup
      title="Enable Font Kerning"
      tooltip={'Can lead to better visual balance for vertical spacing of text if font and browser supports it'}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$enableVerticalFontKerning$}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Enable VPAL"
      tooltip={'Can lead to more natural spacing for vertically laid-out text if font and browser supports it'}
    >
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$enableFontVPAL$} />
    </SettingsItemGroup>
    <SettingsItemGroup title="Text Orientation" tooltip={verticalTextOrientationTooltip}>
      <ButtonToggleGroup
        options={optionsForVerticalTextOrientation}
        bind:selectedOptionId={$verticalTextOrientation$}
      />
    </SettingsItemGroup>
  {/if}
  <SettingsItemGroup
    title="Prioritize Reader Styles"
    tooltip={'When enabled the "important" declaration is added to certain rules like margins or justification which makes it more likely to be applied in case of conflicting book styles'}
  >
    <ButtonToggleGroup
      options={optionsForToggle}
      bind:selectedOptionId={$prioritizeReaderStyles$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup
    title="Enable Text Justification"
    tooltip={'When enabled the reader adds styles to justify text content of paragraphs'}
  >
    <ButtonToggleGroup
      options={optionsForToggle}
      bind:selectedOptionId={$enableTextJustification$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup
    title="Enable Pretty Text Wrap"
    tooltip={'When enabled the reader adds the pretty text wrap style to supported browsers'}
  >
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$enableTextWrapPretty$} />
  </SettingsItemGroup>
  <SettingsItemGroup
    title="Paragraph Margin Mode"
    tooltip={'When set to manual it allows to specify a margin value which should be applied to paragraphs'}
  >
    <ButtonToggleGroup
      options={optionsForTextMarginMode}
      bind:selectedOptionId={$textMarginMode$}
    />
  </SettingsItemGroup>
  {#if wakeLockSupported}
    <SettingsItemGroup
      title="Enable Screen Lock"
      tooltip={'When enabled the reader site attempts to request a WakeLock that prevents device screens from dimming or locking'}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$enableReaderWakeLock$}
      />
    </SettingsItemGroup>
  {/if}
  <SettingsItemGroup title="Show Character Counter">
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$showCharacterCounter$} />
  </SettingsItemGroup>
  <SettingsItemGroup title="Show Percentage">
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$showPercentage$} />
  </SettingsItemGroup>
  <SettingsItemGroup title="Show Footer Chapter Characters">
    <ButtonToggleGroup
      options={optionsForToggle}
      bind:selectedOptionId={$showFooterChapterCharacterCounter$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup title="Show Footer Chapter Percentage">
    <ButtonToggleGroup
      options={optionsForToggle}
      bind:selectedOptionId={$showFooterChapterPercentage$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup title="Disable Wheel Navigation">
    <ButtonToggleGroup
      options={optionsForToggle}
      bind:selectedOptionId={$disableWheelNavigation$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup
    title="Close Confirmation"
    tooltip={`When enabled asks for confirmation on closing/reloading a reader tab and unsaved changes were detected`}
  >
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$confirmClose$} />
  </SettingsItemGroup>
  <SettingsItemGroup
    title="Manual Bookmark"
    tooltip={'If enabled current position will not be bookmarked when leaving the reader via menu elements'}
  >
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$manualBookmark$} />
  </SettingsItemGroup>
  <SettingsItemGroup title="Auto Bookmark" tooltip={autoBookmarkTooltip}>
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$autoBookmark$} />
  </SettingsItemGroup>
  <SettingsItemGroup title="Blur image">
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$hideSpoilerImage$} />
  </SettingsItemGroup>
  {#if $hideSpoilerImage$}
    <SettingsItemGroup
      title="Blur Mode"
      tooltip="Determines if all or only images after the table of contents will be blurred"
    >
      <ButtonToggleGroup
        options={optionsForBlurMode}
        bind:selectedOptionId={$hideSpoilerImageMode$}
      />
    </SettingsItemGroup>
  {/if}
  <SettingsItemGroup title="Furigana" tooltip={furiganaStyleTooltip}>
    <ButtonToggleGroup options={optionsForFuriganaStyle} bind:selectedOptionId={$furiganaStyle$} />
  </SettingsItemGroup>
  {#if $statisticsEnabled$}
    <SettingsItemGroup
      title="Custom Point pauses Tracker"
      tooltip={'When enabled the tracker will auto pause and unpause while setting a custom reading point'}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$pauseTrackerOnCustomPointChange$}
      />
    </SettingsItemGroup>
  {/if}
  {#if $viewMode$ === ViewMode.Continuous}
    <SettingsItemGroup
      title="Custom Reading Point"
      tooltip={'Allows to set a persistent custom point in the reader from which the current progress and bookmark is calculated when enabled'}
    >
      <div class="flex items-center">
        <ButtonToggleGroup
          options={optionsForToggle}
          bind:selectedOptionId={$customReadingPointEnabled$}
        />
        {#if $customReadingPointEnabled$}
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
        bind:selectedOptionId={$autoPositionOnResize$}
      />
    </SettingsItemGroup>
  {:else}
    <SettingsItemGroup title="Avoid Page Break" tooltip={avoidPageBreakTooltip}>
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$avoidPageBreak$} />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Selection to Bookmark"
      tooltip={'When enabled bookmarks will be placed to a near paragraph of current/previous selected text instead of page start'}
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$selectionToBookmarkEnabled$}
      />
    </SettingsItemGroup>
    <SettingsItemGroup
      title="Tap to Flip"
      tooltip="Reserves small margins on the left and right on which you can tap to turn pages"
    >
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$enableTapEdgeToFlip$} />
    </SettingsItemGroup>
    {#if !verticalMode}
      <SettingsItemGroup title="Page Columns" tooltip="# of text columns rendered">
        <input type="number" class={inputClasses} step="1" min="0" bind:value={$pageColumns$} />
      </SettingsItemGroup>
    {/if}
  {/if}
</div>
