<script lang="ts">
  import {
    blurImageMode$,
    customThemes$,
    enableFontVPAL$,
    enableTextJustification$,
    enableTextWrapPretty$,
    fontFamilyGroupOne$,
    fontFamilyGroupTwo$,
    fontSize$,
    furiganaStyle$,
    lineHeight$,
    prioritizeReaderStyles$,
    textIndentation$,
    textMarginMode$,
    textMarginValue$,
    theme$,
    verticalTextOrientation$,
    writingMode$
  } from '$lib/data/store';
  import { BlurMode } from '$lib/data/blur-mode';
  import { FuriganaStyle, setupRubyClickListeners } from '$lib/data/furigana-style';
  import { resolveThemeOption } from '$lib/data/theme-option';
  import { setupSpoilerImageListeners } from '$lib/components/book-reader/book-content-enhancement';
  import { displayTitle } from '$lib/functions/book-title';

  interface Props {
    class?: string;
  }

  let { class: className }: Props = $props();

  const previewBookTitle = '余白のリズム【電子限定短編付き】（白波文庫）';

  let previewText: HTMLDivElement | undefined = $state();
  let previewIllustration: HTMLDivElement | undefined = $state();
  let themeOption = $derived(resolveThemeOption($theme$, $customThemes$));
  let serifFontFamily = $derived($fontFamilyGroupOne$);
  let sansSerifFontFamily = $derived($fontFamilyGroupTwo$);
  let vertical = $derived($writingMode$ === 'vertical-rl');
  let imageBlurred = $derived($blurImageMode$ !== BlurMode.OFF);
  let previewBookDisplayTitle = $derived(displayTitle(previewBookTitle));

  $effect(() => {
    if (!previewText) return;
    previewText
      .querySelectorAll('ruby.reveal-rt')
      .forEach((element) => element.classList.remove('reveal-rt'));
    return setupRubyClickListeners(previewText, $furiganaStyle$);
  });

  $effect(() => {
    const illustration = previewIllustration;
    const blurMode = $blurImageMode$;
    if (!illustration || blurMode === BlurMode.OFF) return;

    const abortController = new AbortController();
    const cleanup = setupSpoilerImageListeners(illustration, abortController.signal);

    return () => {
      abortController.abort();
      cleanup();
    };
  });
</script>

<aside class={['preview-shell', className]} aria-label="Live reader preview">
  <div class="preview-heading">
    <p>{previewBookDisplayTitle}</p>
    <span>Preview</span>
  </div>

  <div
    class="reader-preview"
    style:color={themeOption.fontColor}
    style:background-color={themeOption.backgroundColor}
  >
    <div
      class="preview-text book-content"
      class:vertical
      class:book-content--writing-vertical-rl={vertical}
      class:book-content--writing-horizontal-rl={!vertical}
      class:book-content--furigana-style-hide={$furiganaStyle$ === FuriganaStyle.Hide}
      class:book-content--furigana-style-dim={$furiganaStyle$ === FuriganaStyle.Dim}
      class:book-content--furigana-style-toggle={$furiganaStyle$ === FuriganaStyle.Toggle}
      class:ttu-apply-important={$prioritizeReaderStyles$}
      class:ttu-apply-justification={$enableTextJustification$}
      class:ttu-margin-manual={$textMarginMode$ === 'manual'}
      class:ttu-text-wrap-pretty={$enableTextWrapPretty$}
      bind:this={previewText}
      lang="ja"
      style:font-size={`${$fontSize$}px`}
      style:font-kerning="normal"
      style:line-height={$lineHeight$}
      style:writing-mode={$writingMode$}
      style:text-orientation={vertical ? $verticalTextOrientation$ : undefined}
      style:font-feature-settings={vertical && $enableFontVPAL$ ? '"vpal"' : undefined}
      style:--font-family-serif={serifFontFamily}
      style:--font-family-sans-serif={sansSerifFontFamily}
      style:--book-content-text-intendation={`${$textIndentation$}rem`}
      style:--book-content-text-margin={`${$textMarginValue$}rem`}
      style:--book-content-hint-furigana-font-color={themeOption.hintFuriganaFontColor}
      style:--book-content-hint-furigana-shadow-color={themeOption.hintFuriganaShadowColor}
    >
      <p style:font-family={serifFontFamily}>
        第3章。ＥＰＵＢ２０２６年版『Words Need Room』を<ruby>縦書き<rt>たてがき</rt></ruby>で<ruby
          >読む<rt>よむ</rt></ruby
        >。
      </p>
      <p>
        段落が続くと、<ruby>余白<rt>よはく</rt></ruby>のリズムも見えてくる。
      </p>
      <p style:margin-block="1.25rem" style:text-align="start" style:text-indent="2.5rem">
        【書籍指定】
      </p>
      <p class="sans" style:font-family={sansSerifFontFamily}>
        第<span class="combined-digits">26</span>版の<ruby>副題<rt>ふくだい</rt></ruby
        >も、ゴシック体ですっきり読める。
      </p>
    </div>

    {#key $blurImageMode$}
      <div
        class="illustration book-content"
        class:book-content--hide-spoiler-image={imageBlurred}
        aria-label={imageBlurred ? 'Blurred story illustration' : 'Story illustration'}
        bind:this={previewIllustration}
      >
        <span class="illustration-image" data-miwake-spoiler-img={imageBlurred ? '' : undefined}>
          <svg viewBox="0 0 160 72" role="img" aria-label="Mountain landscape sample">
            <rect width="160" height="72" fill="#bed9ee" />
            <circle cx="126" cy="18" r="10" fill="#fff3ac" />
            <path d="M0 63 36 27l25 25 20-18 39 38H0Z" fill="#668b72" />
            <path d="m61 52 20-18 39 38H80Z" fill="#456958" />
          </svg>
        </span>
      </div>
    {/key}
  </div>
</aside>

<style>
  .preview-shell {
    border: 1px solid var(--color-gray-300);
    border-radius: 0.75rem;
    background: rgb(255 255 255 / 65%);
    padding: 0.75rem;

    @media (width >= 64rem) {
      position: sticky;
      top: 8rem;
    }
  }

  .preview-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.625rem;

    p {
      min-width: 0;
      font-weight: 500;
      line-height: 1.25;
    }

    span {
      flex: none;
      color: var(--color-gray-400);
      font-size: 0.5625rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
  }

  .reader-preview {
    display: grid;
    min-height: 22rem;
    grid-template-rows: minmax(0, 1fr) auto;
    overflow: hidden;
    border-radius: 0.5rem;
  }

  .preview-text {
    overflow: hidden;
    padding: 1.25rem;

    &.vertical {
      width: 100%;
      height: 19.5rem;
    }
  }

  .combined-digits {
    text-combine-upright: all;
  }

  .illustration {
    position: relative;
    height: 5rem;
    overflow: hidden;
    border-top: 1px solid rgb(127 127 127 / 25%);
    background: rgb(127 127 127 / 10%);

    .illustration-image {
      display: block;
      width: 100%;
      height: 100%;
    }

    svg {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }
</style>
