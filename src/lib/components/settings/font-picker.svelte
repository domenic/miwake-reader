<script lang="ts">
  import {
    type FontGroup,
    fontGroupLabels,
    fontDisplayNames,
    bundledFonts,
    defaultFonts,
    reservedFontNames,
    userFontsCacheName,
    type UserFont
  } from '$lib/data/fonts';
  import { faComputer, faTrash, faUpload } from '@fortawesome/free-solid-svg-icons';
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses } from '$lib/css-classes';
  import { userFonts$ } from '$lib/data/store';
  import { logger } from '$lib/data/logger';
  import { parseFontName } from '$lib/functions/parse-font-name';
  import { messageDialog } from '$lib/data/simple-dialogs';
  import Fa from 'svelte-fa';
  import { onMount } from 'svelte';

  interface Props {
    group: FontGroup;
    selectedFont: string;
  }

  let { group, selectedFont = $bindable() }: Props = $props();

  let view: 'list' | 'system' = $state('list');
  let systemFontName = $state('');
  let fontCache = $state<Cache>();
  let fileInput = $state<HTMLInputElement>();
  let isOpen = $state(false);

  const popoverId = $derived(`font-picker-${group}`);
  const fonts = $derived(bundledFonts[group]);
  const allOptions = $derived([...fonts, ...$userFonts$.map((uf) => uf.name)]);
  let focusedIndex = $state(-1);
  let listboxEl = $state<HTMLElement>();

  function displayName(name: string): string {
    return fontDisplayNames[name] ?? name;
  }

  function focusOption(index: number) {
    focusedIndex = index;
    const options = listboxEl?.querySelectorAll<HTMLElement>('[role="option"]');
    options?.[index]?.focus();
  }

  function handleListboxKeydown(e: KeyboardEvent) {
    const count = allOptions.length;
    if (!count) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        focusOption((focusedIndex + 1) % count);
        break;
      case 'ArrowUp':
        e.preventDefault();
        focusOption((focusedIndex - 1 + count) % count);
        break;
      case 'Home':
        e.preventDefault();
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        focusOption(count - 1);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (focusedIndex >= 0 && focusedIndex < count) {
          selectFont(allOptions[focusedIndex]);
        }
        break;
    }
  }

  const isSystemFont = $derived(
    selectedFont &&
      !fonts.includes(selectedFont as any) &&
      !$userFonts$.some((uf) => uf.name === selectedFont)
  );

  let knownUserFontNames = new Set($userFonts$.map((uf) => uf.name));

  $effect(() => {
    const current = new Set($userFonts$.map((uf) => uf.name));
    if (knownUserFontNames.has(selectedFont) && !current.has(selectedFont)) {
      selectedFont = defaultFonts[group];
    }
    knownUserFontNames = current;
  });

  onMount(async () => {
    try {
      if ('caches' in window) {
        fontCache = await caches.open(userFontsCacheName);
      }
    } catch (error: any) {
      logger.error(`Error loading font cache: ${error.message}`);
    }
  });

  function selectFont(name: string) {
    selectedFont = name;
    document.getElementById(popoverId)?.hidePopover();
  }

  async function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !fontCache) return;

    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['woff2', 'woff', 'ttf', 'otf'].includes(ext)) {
      messageDialog({
        title: 'Unsupported format',
        message: 'Only .woff2, .woff, .ttf, and .otf fonts are supported.'
      });
      return;
    }

    let name = await parseFontName(file);

    if ($userFonts$.some((uf) => uf.name === name)) {
      selectFont(name);
      return;
    }

    if (reservedFontNames.has(name)) {
      name = file.name.replace(/\.[^.]+$/, '');
    }

    if (reservedFontNames.has(name) || $userFonts$.some((uf) => uf.name === name)) {
      messageDialog({ title: 'Name conflict', message: `A font named "${name}" already exists.` });
      return;
    }

    try {
      const path = `/userfonts/${encodeURIComponent(file.name)}`;
      await fontCache.put(
        path,
        new Response(file, {
          headers: {
            'Content-Type': `font/${ext}`,
            'Content-Length': `${file.size}`
          }
        })
      );
      $userFonts$ = [...$userFonts$, { name, path, fileName: file.name }];
      selectFont(name);
    } catch (error: any) {
      logger.error(`Error uploading font: ${error.message}`);
      messageDialog({ title: 'Upload failed', message: error.message });
    }
  }

  async function removeFont(userFont: UserFont) {
    if (!fontCache) return;
    try {
      await fontCache.delete(userFont.path);
      $userFonts$ = $userFonts$.filter((uf) => uf.path !== userFont.path);
      if (selectedFont === userFont.name) {
        selectedFont = defaultFonts[group];
      }
    } catch (error: any) {
      logger.error(`Error deleting font: ${error.message}`);
    }
  }

  function handlePopoverToggle(event: ToggleEvent) {
    isOpen = event.newState === 'open';
    if (isOpen) {
      view = 'list';
      systemFontName = isSystemFont ? selectedFont : '';
      const idx = allOptions.indexOf(selectedFont);
      requestAnimationFrame(() => focusOption(idx >= 0 ? idx : 0));
    }
  }
</script>

<section class="pb-8 md:pb-3">
  <h2 class="mb-2 text-xl font-medium capitalize">{fontGroupLabels[group]}</h2>
  <button
    use:ripple
    type="button"
    class="flex w-full cursor-pointer items-center justify-between rounded-lg border border-gray-300 px-3 py-2.5 text-left"
    class:rounded-b-none={isOpen}
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    popovertarget={popoverId}
  >
    <div class="min-w-0">
      <div class="truncate text-sm font-medium">{displayName(selectedFont)}</div>
      <div class="truncate text-xs text-gray-400">
        Preview: <span style:font-family="{selectedFont}, {group}"
          >永遠のノベルをＡＩが3秒で書く</span
        >
      </div>
    </div>
    <svg class="ml-2 shrink-0 text-gray-400" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        stroke-width="1.2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>

  <div
    popover
    id={popoverId}
    class="font-picker-popover m-0 overflow-hidden rounded-lg rounded-t-none border border-gray-300 bg-white p-0 shadow-lg"
    ontoggle={handlePopoverToggle}
  >
    {#if view === 'list'}
      <div
        class="max-h-96 overflow-y-auto py-2"
        role="listbox"
        tabindex="-1"
        aria-label={fontGroupLabels[group]}
        bind:this={listboxEl}
        onkeydown={handleListboxKeydown}
      >
        <div role="group" aria-labelledby="{popoverId}-bundled">
          <div id="{popoverId}-bundled" class="mb-1 mt-1 px-5 text-xs font-medium text-gray-500">
            Bundled
          </div>

          {#each fonts as font, i (font)}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              role="option"
              aria-selected={font === selectedFont}
              tabindex={i === focusedIndex ? 0 : -1}
              use:ripple
              class="flex w-full cursor-pointer items-center justify-between px-5 py-2 text-left outline-none"
              class:bg-gray-700={font === selectedFont}
              class:text-white={font === selectedFont}
              onclick={() => selectFont(font)}
            >
              <div class="min-w-0">
                <div class="text-[13px]" class:font-medium={font === selectedFont}>
                  {displayName(font)}
                </div>
                <div
                  class="mt-px text-xs"
                  class:opacity-60={font === selectedFont}
                  class:text-gray-400={font !== selectedFont}
                >
                  <span style:font-family="{font}, {group}">永遠のノベルをＡＩが3秒で書く</span>
                </div>
              </div>
              {#if font === selectedFont}
                <svg class="ml-2 shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M3 8.5l3.5 3.5L13 4"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
              {/if}
            </div>
          {/each}
        </div>

        {#if fontCache && $userFonts$.length > 0}
          <hr class="mx-5 my-1.5 border-gray-300" />
          <div role="group" aria-labelledby="{popoverId}-user">
            <div id="{popoverId}-user" class="mb-1 mt-2 px-5 text-xs font-medium text-gray-500">
              My Fonts
            </div>

            {#each $userFonts$ as userFont, i (userFont.path)}
              {@const optionIndex = fonts.length + i}
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <div
                role="option"
                aria-selected={userFont.name === selectedFont}
                tabindex={optionIndex === focusedIndex ? 0 : -1}
                use:ripple
                class="flex cursor-pointer items-center justify-between px-5 py-2 outline-none"
                class:bg-gray-700={userFont.name === selectedFont}
                class:text-white={userFont.name === selectedFont}
                onclick={() => selectFont(userFont.name)}
              >
                <div class="min-w-0 flex-1">
                  <div class="text-[13px]" class:font-medium={userFont.name === selectedFont}>
                    {userFont.name}
                  </div>
                  <div
                    class="mt-px text-xs"
                    class:opacity-60={userFont.name === selectedFont}
                    class:text-gray-400={userFont.name !== selectedFont}
                  >
                    <span style:font-family="{userFont.name}, {group}"
                      >永遠のノベルをＡＩが3秒で書く</span
                    >
                  </div>
                </div>
                {#if userFont.name === selectedFont}
                  <svg class="ml-2 shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path
                      d="M3 8.5l3.5 3.5L13 4"
                      stroke="currentColor"
                      stroke-width="1.5"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                {:else}
                  <button
                    type="button"
                    title="Remove font"
                    class="ml-2 shrink-0 cursor-pointer p-1 text-xs text-gray-400 hover:text-gray-600"
                    onclick={(e) => {
                      e.stopPropagation();
                      removeFont(userFont);
                    }}
                  >
                    <Fa icon={faTrash} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        {/if}

        <hr class="mx-5 my-1.5 border-gray-300" />

        {#if fontCache}
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 px-5 py-2 text-left text-gray-500 hover:bg-gray-50"
            onclick={() => fileInput?.click()}
          >
            <Fa icon={faUpload} />
            <span class="text-[13px]">Upload font file...</span>
          </button>
        {/if}

        {#if isSystemFont}
          <button
            type="button"
            class="flex w-full cursor-pointer items-center justify-between bg-gray-700 px-5 py-2 text-left text-white"
            onclick={() => {
              view = 'system';
            }}
          >
            <div class="flex items-center gap-2">
              <Fa icon={faComputer} class="shrink-0 opacity-60" />
              <span class="text-[13px] font-medium">{selectedFont}</span>
              <span class="text-[11px] opacity-60">system font</span>
            </div>
            <svg class="ml-2 shrink-0" width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path
                d="M3 8.5l3.5 3.5L13 4"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>
        {:else}
          <button
            type="button"
            class="flex w-full cursor-pointer items-center gap-2 px-5 py-2 text-left text-gray-500 hover:bg-gray-50"
            onclick={() => {
              view = 'system';
            }}
          >
            <Fa icon={faComputer} />
            <span class="text-[13px]">Use system font...</span>
          </button>
        {/if}
      </div>
    {:else}
      <div class="p-5">
        <button
          type="button"
          class="mb-3 flex cursor-pointer items-center gap-1.5 text-[13px] text-gray-500 hover:text-gray-700"
          onclick={() => {
            view = 'list';
          }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" class="shrink-0">
            <path
              d="M10 3L4 8l6 5"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          Back
        </button>
        <div class="mb-1.5 text-[13px] text-gray-500">System font name</div>
        <input
          type="text"
          class="mb-3 w-full rounded-lg border border-gray-300 px-2.5 py-2 text-sm outline-none focus:border-gray-500"
          bind:value={systemFontName}
          placeholder="e.g. Hiragino Mincho ProN"
        />

        <div class="mb-4 rounded-lg border border-gray-300 p-3">
          <div class="mb-1.5 text-[9px] uppercase tracking-widest text-gray-400">Preview</div>
          <div class="text-[15px] leading-relaxed" style:font-family="{systemFontName}, {group}">
            永遠のノベルをＡＩが3秒で書く
          </div>
        </div>

        <div class="flex justify-end">
          <button
            use:ripple
            type="button"
            class="{buttonClasses} disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!systemFontName.trim()}
            onclick={() => selectFont(systemFontName.trim())}>Use this font</button
          >
        </div>

        <div class="mt-4 border-t border-gray-300 pt-3 text-xs leading-relaxed text-gray-400">
          Type the exact font family name as installed on your system. The preview updates live — if
          the text looks generic, the font wasn't found.
        </div>
      </div>
    {/if}
  </div>

  <input
    type="file"
    class="hidden"
    accept=".woff2,.woff,.ttf,.otf"
    bind:this={fileInput}
    onchange={handleFileUpload}
  />
</section>

<style>
  .font-picker-popover {
    position-area: bottom span-right;
    width: anchor-size(width);
  }
</style>
