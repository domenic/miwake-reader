<script module lang="ts">
  import ThemeEditorDialog from '$lib/components/settings/theme-editor-dialog.svelte';
  import { showDialog } from '$lib/components/dialog/show-dialog';

  export function showThemeEditorDialog(params: { selectedTheme?: string } = {}) {
    showDialog(
      ThemeEditorDialog,
      {
        selectedTheme: params.selectedTheme
      },
      {
        closedBy: 'any',
        resolveResult: () => undefined
      }
    );
  }
</script>

<script lang="ts">
  import DialogButton from '$lib/components/dialog/dialog-button.svelte';
  import DialogContentShell from '$lib/components/dialog/dialog-content-shell.svelte';
  import SettingsSegmentedControl from '$lib/components/settings/settings-segmented-control.svelte';
  import { inputClasses } from '$lib/css-classes';
  import { customThemes$, theme$ } from '$lib/data/store';
  import {
    FuriganaStyle,
    furiganaStyleOptions,
    setupRubyClickListeners
  } from '$lib/data/furigana-style';
  import { availableThemes, type ThemeOption } from '$lib/data/theme-option';
  import { untrack } from 'svelte';

  // TODO: Replace our color picker with native <input type="color" alpha="">
  // once the alpha attribute ships in all browsers, and remove the popover/range UI.

  interface RgbaColor {
    r: number;
    g: number;
    b: number;
    a: number;
  }

  interface Props {
    selectedTheme?: string;
  }

  let { selectedTheme }: Props = $props();

  const init = untrack(() => ({
    selectedTheme
  }));

  const isEditMode = !!init.selectedTheme;

  type ThemeColors = Record<keyof ThemeOption, RgbaColor>;

  function mapThemeValues<T>(mapper: (key: keyof ThemeOption) => T): Record<keyof ThemeOption, T> {
    return {
      fontColor: mapper('fontColor'),
      backgroundColor: mapper('backgroundColor'),
      selectionFontColor: mapper('selectionFontColor'),
      selectionBackgroundColor: mapper('selectionBackgroundColor'),
      hintFuriganaShadowColor: mapper('hintFuriganaShadowColor'),
      hintFuriganaFontColor: mapper('hintFuriganaFontColor'),
      tooltipTextFontColor: mapper('tooltipTextFontColor')
    };
  }

  function parseRgba(str: string): RgbaColor {
    const match = str.match(/rgba?\((.+)\)/);
    const parts = (match?.[1] || '0,0,0,1').split(',').map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }

  function toRgbaString({ r, g, b, a }: RgbaColor): string {
    return `rgba(${r},${g},${b},${a})`;
  }

  function rgbaToHex({ r, g, b }: RgbaColor): string {
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  function hexToRgb(hex: string): { r: number; g: number; b: number } {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16)
    };
  }

  function parseTheme(theme: ThemeOption): ThemeColors {
    return mapThemeValues((key) => parseRgba(theme[key]));
  }

  function serializeTheme(theme: ThemeColors): ThemeOption {
    return mapThemeValues((key) => toRgbaString(theme[key]));
  }

  function loadInitialTheme(): ThemeColors {
    if (init.selectedTheme) {
      const existing = $customThemes$[init.selectedTheme];
      if (existing) return parseTheme(existing);
    }
    return parseTheme(availableThemes.get('light-theme')!);
  }

  let themeName = $state(init.selectedTheme ?? '');
  let themeNameElm = $state<HTMLInputElement>();
  let customTheme: ThemeColors = $state(loadInitialTheme());
  let previewMode: FuriganaStyle = $state(FuriganaStyle.Dim);
  let existingThemeIds = $derived([...availableThemes.keys(), ...Object.keys($customThemes$)]);

  function handleColorInput(attribute: keyof ThemeOption, hex: string) {
    const { r, g, b } = hexToRgb(hex);
    customTheme = { ...customTheme, [attribute]: { r, g, b, a: customTheme[attribute].a } };
  }

  let previewTextEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (!previewTextEl) return () => {};
    previewTextEl
      .querySelectorAll('ruby.reveal-rt')
      .forEach((element) => element.classList.remove('reveal-rt'));
    return setupRubyClickListeners(previewTextEl, previewMode);
  });

  function handleAlphaInput(attribute: keyof ThemeOption, alpha: number) {
    const current = customTheme[attribute];
    customTheme = { ...customTheme, [attribute]: { ...current, a: alpha } };
  }

  function validateAndSave(): boolean {
    if (!themeNameElm) return false;

    const isReserved = availableThemes.has(themeName);
    const isDuplicate = themeName !== init.selectedTheme && themeName in $customThemes$;
    themeNameElm.setCustomValidity(
      isReserved
        ? 'This name is reserved!'
        : isDuplicate
          ? 'A theme with this name already exists!'
          : ''
    );

    if (!themeNameElm.reportValidity()) {
      return false;
    }

    const newTheme = serializeTheme(customTheme);
    const customThemes = { ...$customThemes$ };

    if (init.selectedTheme && init.selectedTheme !== themeName) {
      delete customThemes[init.selectedTheme];
    }

    $customThemes$ = { ...customThemes, [themeName]: newTheme };
    $theme$ = themeName;

    return true;
  }

  // Color row definitions
  interface ColorDef {
    attribute: keyof ThemeOption;
    label: string;
    subtitle?: string;
  }

  const colorAttributes: { heading: string; cols?: number; items: ColorDef[] }[] = [
    {
      heading: 'Main',
      cols: 2,
      items: [
        { attribute: 'fontColor', label: 'Text' },
        { attribute: 'backgroundColor', label: 'Background' }
      ]
    },
    {
      heading: 'Furigana',
      items: [
        {
          attribute: 'hintFuriganaFontColor',
          label: 'Hint reading',
          subtitle: 'Color of faint readings'
        },
        {
          attribute: 'hintFuriganaShadowColor',
          label: 'Hint glow',
          subtitle: 'Glow behind text with hidden readings'
        }
      ]
    },
    {
      heading: 'Footer',
      items: [{ attribute: 'tooltipTextFontColor', label: 'Footer text' }]
    }
  ];

  const popoverSuffix = Math.random().toString(36).slice(2, 10);
</script>

<DialogContentShell
  title={isEditMode ? 'Edit theme' : 'Create theme'}
  onsubmit={(e) => {
    if (!validateAndSave()) {
      e.preventDefault();
    }
  }}
>
  <select
    class="theme-copy-from cursor-pointer appearance-none bg-none rounded border border-gray-300 px-2 py-1 text-sm text-cyan-900"
    onchange={(e) => {
      const select = e.target as HTMLSelectElement;
      const theme = availableThemes.get(select.value) || $customThemes$[select.value];
      if (theme) customTheme = parseTheme(theme);
      select.value = '';
    }}
  >
    <option value="" disabled selected>Copy from...</option>
    {#each existingThemeIds as themeId (themeId)}
      <option value={themeId}>{themeId}</option>
    {/each}
  </select>

  <input
    type="text"
    class="{inputClasses} mb-4"
    required
    placeholder="Theme name"
    bind:value={themeName}
    bind:this={themeNameElm}
    oninput={() => themeNameElm?.setCustomValidity('')}
  />

  <!-- Preview panel -->
  <div
    class="preview mb-4 overflow-hidden rounded-md border border-gray-300"
    style:background-color={toRgbaString(customTheme.backgroundColor)}
    style:color={toRgbaString(customTheme.fontColor)}
    style:--book-content-hint-furigana-font-color={toRgbaString(customTheme.hintFuriganaFontColor)}
    style:--book-content-hint-furigana-shadow-color={toRgbaString(
      customTheme.hintFuriganaShadowColor
    )}
  >
    <div class="mb-3 flex items-center justify-between px-5 pt-3">
      <div class="min-w-0">
        <SettingsSegmentedControl
          label="Furigana preview mode"
          options={furiganaStyleOptions}
          bind:value={previewMode}
        />
      </div>
      <span class="text-[9px] tracking-widest text-gray-400">PREVIEW</span>
    </div>
    <div class="px-5 pb-4">
      <p
        bind:this={previewTextEl}
        class="book-content"
        class:book-content--furigana-style-dim={previewMode === FuriganaStyle.Dim}
        class:book-content--furigana-style-toggle={previewMode === FuriganaStyle.Toggle}
        class:book-content--furigana-style-hide={previewMode === FuriganaStyle.Hide}
        style="font-family: 'Noto Serif JP', Georgia, serif; font-size: 15px; line-height: 1.8"
        lang="ja"
      >
        <ruby>彼女<rt>かのじょ</rt></ruby>は<ruby>図書館<rt>としょかん</rt></ruby>で<ruby
          >静<rt>しず</rt></ruby
        >かに<ruby>本<rt>ほん</rt></ruby>を<ruby>読<rt>よ</rt></ruby>んでいた。
      </p>

      <div
        class="mt-2 flex h-8 w-full items-center justify-between text-xs leading-none"
        style:color={toRgbaString(customTheme.tooltipTextFontColor)}
      >
        <div class="flex h-full"></div>
        <div class="select-none whitespace-pre">2661 / 143806 1.85%</div>
      </div>
    </div>
  </div>

  <!-- Color sections -->
  <div class="space-y-4">
    {#each colorAttributes as section (section.heading)}
      <div>
        <h3 class="mb-2 font-medium">{section.heading}</h3>
        <div
          class="flex flex-col gap-2"
          class:grid={section.cols === 2}
          class:grid-cols-2={section.cols === 2}
          class:gap-3={section.cols === 2}
        >
          {#each section.items as { attribute, label, subtitle } (attribute)}
            {@const popoverId = `color-${attribute}-${popoverSuffix}`}
            <button
              type="button"
              class="flex items-center gap-3 rounded-md border border-gray-300 px-3 py-2 text-left"
              popovertarget={popoverId}
            >
              <div
                class="swatch size-7 shrink-0 rounded-full border border-black/15"
                style:--swatch-color={toRgbaString(customTheme[attribute])}
              ></div>
              <div class="min-w-0">
                <div class="text-sm">{label}</div>
                {#if subtitle}
                  <div class="text-[11px] text-gray-400">{subtitle}</div>
                {/if}
              </div>
            </button>
            <div
              popover
              id={popoverId}
              class="color-popover rounded-lg border border-black/15 bg-white p-3 shadow-lg"
            >
              <input
                type="color"
                class="color-input h-12 w-full cursor-pointer rounded border border-black/15 p-0"
                value={rgbaToHex(customTheme[attribute])}
                oninput={(e) => handleColorInput(attribute, (e.target as HTMLInputElement).value)}
              />
              <input
                type="range"
                class="alpha-slider mt-2 h-3 w-full cursor-pointer rounded-md"
                style:--slider-color={rgbaToHex(customTheme[attribute])}
                min="0"
                max="1"
                step="0.01"
                value={customTheme[attribute].a}
                oninput={(e) =>
                  handleAlphaInput(attribute, parseFloat((e.target as HTMLInputElement).value))}
              />
            </div>
          {/each}
        </div>
      </div>
    {/each}
  </div>

  {#snippet actions()}
    <DialogButton behavior="close">Cancel</DialogButton>
    <DialogButton behavior="submit">Save theme</DialogButton>
  {/snippet}
</DialogContentShell>

<style>
  /* Shared checkerboard for alpha visibility */
  .swatch,
  .alpha-slider {
    --checkerboard:
      linear-gradient(45deg, #ccc 25%, transparent 25%) 0 0 / 8px 8px,
      linear-gradient(-45deg, #ccc 25%, transparent 25%) 0 4px / 8px 8px,
      linear-gradient(45deg, transparent 75%, #ccc 75%) 4px -4px / 8px 8px,
      linear-gradient(-45deg, transparent 75%, #ccc 75%) -4px 0 / 8px 8px;
  }

  .swatch {
    background: linear-gradient(var(--swatch-color), var(--swatch-color)), var(--checkerboard);
  }

  .color-popover {
    position-area: bottom span-right;
  }

  .theme-copy-from {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: 0;
    z-index: 1;
  }

  @media (max-width: 34rem) {
    .theme-copy-from {
      position: static;
      margin-block-end: 1rem;
    }
  }

  .alpha-slider {
    appearance: none;
    background: linear-gradient(to right, transparent, var(--slider-color)), var(--checkerboard);
  }

  /* Pseudo-element selectors not supported by Tailwind */
  .alpha-slider::-webkit-slider-thumb,
  .alpha-slider::-moz-range-thumb {
    appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: white;
    border: 2px solid rgba(0, 0, 0, 0.3);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  }

  .color-input {
    appearance: none;
  }

  .color-input::-webkit-color-swatch-wrapper {
    padding: 2px;
  }

  .color-input::-webkit-color-swatch,
  .color-input::-moz-color-swatch {
    border: none;
    border-radius: 2px;
  }
</style>
