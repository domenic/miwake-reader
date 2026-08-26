<script lang="ts">
  import { browser } from '$app/environment';
  import FontPicker from '$lib/components/settings/font-picker.svelte';
  import ReaderPreview from '$lib/components/settings/appearance/reader-preview.svelte';
  import ThemePicker from '$lib/components/settings/appearance/theme-picker.svelte';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import type { SettingsApplicabilityDetails } from '$lib/components/settings/settings-applicability.svelte';
  import SettingsNumberInput from '$lib/components/settings/settings-number-input.svelte';
  import SettingsNumberItem from '$lib/components/settings/settings-number-item.svelte';
  import SettingsRadioItem from '$lib/components/settings/settings-radio-item.svelte';
  import SettingsRestoreDefaults from '$lib/components/settings/settings-restore-defaults.svelte';
  import SettingsSection from '$lib/components/settings/settings-section.svelte';
  import SettingsSegmentedControl from '$lib/components/settings/settings-segmented-control.svelte';
  import SettingsSwitchItem from '$lib/components/settings/settings-switch-item.svelte';
  import { BlurMode } from '$lib/data/blur-mode';
  import { furiganaStyleOptions } from '$lib/data/furigana-style';
  import {
    appearanceSettingsDefaults,
    appearanceSettingsLimits,
    readerModeSettingsDefaults
  } from '$lib/data/settings-defaults';
  import type { VerticalTextOrientation } from '$lib/data/vertical-text-orientation';
  import {
    blurImageMode$,
    enableFontVPAL$,
    enableTextJustification$,
    enableTextWrapPretty$,
    fontFamilyGroupOne$,
    fontFamilyGroupTwo$,
    fontSize$,
    furiganaStyle$,
    lineHeight$,
    prioritizeReaderStyles$,
    simplifyBookTitles$,
    textIndentation$,
    textMarginMode$,
    textMarginValue$,
    theme$,
    verticalTextOrientation$,
    viewMode$,
    writingMode$
  } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  const bookTitleOptions = [
    {
      id: true,
      label: 'Simplified',
      description:
        'Hides recognized edition, imprint, and bundled-content suffixes. Stored titles are unchanged.',
      isDefault: true
    },
    {
      id: false,
      label: 'Full',
      description: 'Shows each imported book title exactly as it is stored.'
    }
  ];

  const paragraphSpacingOptions = [
    { id: 'auto' as const, label: 'Book' },
    { id: 'manual' as const, label: 'Custom' }
  ];

  const paragraphAlignmentOptions = [
    {
      id: false,
      label: 'Book formatting',
      description: 'Keeps the paragraph alignment supplied by the book.',
      isDefault: true
    },
    {
      id: true,
      label: 'Justified',
      description: 'Aligns text evenly along both edges of each paragraph.'
    }
  ];

  const imageSpoilerOptions = [
    {
      id: BlurMode.OFF,
      label: 'Show images',
      description: 'Displays illustrations immediately.',
      isDefault: true
    },
    {
      id: BlurMode.AFTER_TOC,
      label: 'Blur story illustrations',
      description: 'Shows the cover and table of contents, then blurs later illustrations.'
    },
    {
      id: BlurMode.ALL,
      label: 'Blur all illustrations',
      description: 'Blurs every non-inline illustration, including the cover.'
    }
  ];

  const verticalOrientationOptions = [
    {
      id: 'mixed' as VerticalTextOrientation,
      label: 'Mixed',
      description: 'Turns unformatted halfwidth Latin letters and numbers sideways.',
      isDefault: true
    },
    {
      id: 'upright' as VerticalTextOrientation,
      label: 'Upright',
      description: 'Keeps unformatted halfwidth Latin letters and numbers upright.'
    }
  ];

  const verticalSpacingOptions = [
    {
      id: false,
      label: 'Standard',
      description: 'Uses the font’s normal full-height vertical spacing.',
      isDefault: true
    },
    {
      id: true,
      label: 'Proportional',
      description: 'Uses proportional vertical metrics when the selected font provides them.'
    }
  ];

  const verticalTextApplicability = {
    label: 'Vertical',
    description: 'Applies only when text direction is set to Vertical.'
  } satisfies SettingsApplicabilityDetails;

  let prettyTextWrapSupported = $derived(browser ? CSS.supports('text-wrap', 'pretty') : undefined);
  let prettyTextWrapDescription = $derived(
    prettyTextWrapSupported === false
      ? 'This browser does not support improved line breaking; the preference still applies in browsers that do.'
      : 'Uses a slower, higher-quality layout pass to improve wrapping; many paragraphs will look unchanged.'
  );

  function restoreDefaults() {
    $writingMode$ = readerModeSettingsDefaults.writingMode;
    $viewMode$ = readerModeSettingsDefaults.viewMode;
    $simplifyBookTitles$ = appearanceSettingsDefaults.simplifyBookTitles;
    $theme$ = appearanceSettingsDefaults.theme;
    $fontFamilyGroupOne$ = appearanceSettingsDefaults.fontFamilyGroupOne;
    $fontFamilyGroupTwo$ = appearanceSettingsDefaults.fontFamilyGroupTwo;
    $fontSize$ = appearanceSettingsDefaults.fontSize;
    $lineHeight$ = appearanceSettingsDefaults.lineHeight;
    $textIndentation$ = appearanceSettingsDefaults.textIndentation;
    $textMarginMode$ = appearanceSettingsDefaults.textMarginMode;
    $textMarginValue$ = appearanceSettingsDefaults.textMarginValue;
    $enableTextJustification$ = appearanceSettingsDefaults.enableTextJustification;
    $furiganaStyle$ = appearanceSettingsDefaults.furiganaStyle;
    $blurImageMode$ = appearanceSettingsDefaults.blurImageMode;
    $prioritizeReaderStyles$ = appearanceSettingsDefaults.prioritizeReaderStyles;
    $enableTextWrapPretty$ = appearanceSettingsDefaults.enableTextWrapPretty;
    $verticalTextOrientation$ = appearanceSettingsDefaults.verticalTextOrientation;
    $enableFontVPAL$ = appearanceSettingsDefaults.enableFontVPAL;
  }
</script>

<svelte:head>
  <title>{formatPageTitle('Appearance Settings')}</title>
</svelte:head>

<div class="appearance-layout">
  <SettingsSection
    class="lg:[grid-area:app]"
    title="Book titles"
    headingId="book-title-display-heading"
  >
    <SettingsRadioItem
      labelledBy="book-title-display-heading"
      options={bookTitleOptions}
      bind:value={$simplifyBookTitles$}
    />
  </SettingsSection>

  <SettingsSection
    class="lg:[grid-area:colors]"
    title="Reader colors"
    description="Choose a built-in palette or create colors that are comfortable for long reading sessions."
  >
    <SettingsItem>
      <ThemePicker />
    </SettingsItem>
  </SettingsSection>

  <ReaderPreview class="min-w-0 lg:[grid-area:preview]" />

  <SettingsSection
    class="lg:[grid-area:typography]"
    title="Reader typography"
    description="Set the typefaces, size, and paragraph rhythm used in the reader."
  >
    <SettingsItem class="grid gap-4 sm:grid-cols-2">
      <FontPicker group="serif" bind:selectedFont={$fontFamilyGroupOne$} />
      <FontPicker group="sans-serif" bind:selectedFont={$fontFamilyGroupTwo$} />
    </SettingsItem>

    <SettingsNumberItem
      label="Text size"
      bind:value={$fontSize$}
      unit="px"
      min={appearanceSettingsLimits.fontSize.minimum}
      max={appearanceSettingsLimits.fontSize.maximum}
      step={appearanceSettingsLimits.fontSize.step}
    />

    <SettingsNumberItem
      label="Line height"
      bind:value={$lineHeight$}
      unit="× text size"
      min={appearanceSettingsLimits.lineHeight.minimum}
      max={appearanceSettingsLimits.lineHeight.maximum}
      step={appearanceSettingsLimits.lineHeight.step}
    />

    <SettingsNumberItem
      label="First-line indent"
      description="Extra indentation at the start of each paragraph."
      bind:value={$textIndentation$}
      unit="rem"
      min={appearanceSettingsLimits.textIndentation.minimum}
      max={appearanceSettingsLimits.textIndentation.maximum}
      step={appearanceSettingsLimits.textIndentation.step}
    />

    <SettingsItem
      label="Paragraph gap"
      description="Custom sets the space before and after each paragraph."
      controlId="appearance-paragraph-gap"
    >
      {#snippet control({ labelledBy, describedBy })}
        <div class="compound-control">
          <SettingsSegmentedControl
            label="Paragraph spacing source"
            options={paragraphSpacingOptions}
            bind:value={$textMarginMode$}
          />
          <SettingsNumberInput
            id="appearance-paragraph-gap"
            bind:value={$textMarginValue$}
            unit="rem"
            {labelledBy}
            {describedBy}
            min={appearanceSettingsLimits.textMarginValue.minimum}
            max={appearanceSettingsLimits.textMarginValue.maximum}
            step={appearanceSettingsLimits.textMarginValue.step}
            disabled={$textMarginMode$ === 'auto'}
          />
        </div>
      {/snippet}
    </SettingsItem>

    <SettingsRadioItem
      legend="Paragraph alignment"
      options={paragraphAlignmentOptions}
      bind:value={$enableTextJustification$}
    />
  </SettingsSection>

  <SettingsSection
    class="lg:[grid-area:aids]"
    title="Reading aids"
    description="Control how language hints and potentially revealing illustrations appear."
  >
    <SettingsRadioItem
      legend="Furigana display"
      description="Controls how pronunciation readings above or beside Japanese text are shown."
      options={furiganaStyleOptions}
      bind:value={$furiganaStyle$}
    />

    <SettingsRadioItem
      legend="Image spoiler protection"
      description="Controls whether illustrations remain blurred until you deliberately reveal them. Inline symbols and decorative glyphs are not blurred."
      options={imageSpoilerOptions}
      bind:value={$blurImageMode$}
    />
  </SettingsSection>

  <SettingsSection
    class="lg:[grid-area:advanced]"
    title="Advanced"
    description="Fine-tune less common typography options."
    collapsible
  >
    <SettingsSwitchItem
      label="Prioritize reader paragraph formatting"
      description="Makes your paragraph gap, first-line indent, alignment, and improved line breaks override conflicting styles in the book."
      bind:checked={$prioritizeReaderStyles$}
    />

    <SettingsSwitchItem
      label="Improve paragraph line breaks"
      description={prettyTextWrapDescription}
      bind:checked={$enableTextWrapPretty$}
    />

    <SettingsRadioItem
      legend="Latin letters and numbers in vertical text"
      description="Controls the fallback orientation for unformatted halfwidth Latin letters and numbers. Fullwidth forms and vertically combined runs remain upright."
      options={verticalOrientationOptions}
      applicability={verticalTextApplicability}
      bind:value={$verticalTextOrientation$}
    />

    <SettingsRadioItem
      legend="Vertical character spacing"
      description="Proportional spacing changes fonts that provide alternate vertical metrics."
      options={verticalSpacingOptions}
      applicability={verticalTextApplicability}
      bind:value={$enableFontVPAL$}
    />
  </SettingsSection>
</div>

<SettingsRestoreDefaults
  pageName="Appearance"
  description="Returns the settings on this page to their original values without deleting custom themes or imported fonts."
  message="This restores the settings shown on this page, including Text direction and Reading flow, to their original values. Custom themes and imported fonts will not be deleted."
  onrestore={restoreDefaults}
/>

<style>
  .appearance-layout {
    display: grid;
    gap: 2rem;
  }

  @media (width >= 64rem) {
    .appearance-layout {
      grid-template-areas:
        'app preview'
        'colors preview'
        'typography preview'
        'aids preview'
        'advanced preview';
      grid-template-columns: minmax(0, 1fr) 20rem;
      column-gap: 1.5rem;
      row-gap: 2rem;
      align-items: start;
    }
  }

  .compound-control {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 0.5rem;
  }
</style>
