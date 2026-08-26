<script lang="ts">
  import { browser } from '$app/environment';
  import { faPen, faPlus, faTrash } from '@fortawesome/free-solid-svg-icons';
  import { showThemeEditorDialog } from '$lib/components/settings/theme-editor-dialog.svelte';
  import { appearanceSettingsDefaults } from '$lib/data/settings-defaults';
  import { customThemes$, theme$ } from '$lib/data/store';
  import { availableThemes } from '$lib/data/theme-option';
  import Fa from 'svelte-fa';

  let themeEntries = $derived([
    ...availableThemes.entries(),
    ...(browser ? Object.entries($customThemes$).filter(([id]) => !availableThemes.has(id)) : [])
  ]);

  const themeButtonClasses =
    'min-h-19 w-full rounded-lg border bg-white text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-color';
  const themeActionButtonClasses =
    'grid size-7 place-items-center rounded-full bg-white/90 text-xs text-black hover:bg-white focus-visible:outline-2 focus-visible:outline-accent-color';

  function deleteTheme(id: string) {
    const nextThemes = { ...$customThemes$ };
    delete nextThemes[id];
    $customThemes$ = nextThemes;

    if ($theme$ === id) {
      $theme$ = appearanceSettingsDefaults.theme;
    }
  }
</script>

<div class="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-3">
  {#each themeEntries as [id, option] (id)}
    <div class="relative min-w-0">
      <button
        type="button"
        class={[
          themeButtonClasses,
          'flex flex-col overflow-hidden p-0',
          $theme$ === id
            ? 'border-accent-color ring-2 ring-accent-color/20'
            : 'border-gray-300 hover:border-gray-500'
        ]}
        aria-pressed={$theme$ === id}
        aria-label={`${id} reading colors`}
        onclick={() => ($theme$ = id)}
      >
        <span
          class="grid min-h-11 place-items-center text-lg"
          lang="ja"
          style:color={option.fontColor}
          style:background-color={option.backgroundColor}>ぁあ</span
        >
        <span class="truncate px-2 py-1.5 text-xs">{id}</span>
      </button>

      {#if !availableThemes.has(id)}
        <div class="absolute top-1 right-1 flex gap-0.5">
          <button
            type="button"
            class={themeActionButtonClasses}
            aria-label={`Edit ${id}`}
            onclick={() => showThemeEditorDialog({ selectedTheme: id })}
          >
            <Fa icon={faPen} />
          </button>
          <button
            type="button"
            class={themeActionButtonClasses}
            aria-label={`Delete ${id}`}
            onclick={() => deleteTheme(id)}
          >
            <Fa icon={faTrash} />
          </button>
        </div>
      {/if}
    </div>
  {/each}

  <button
    type="button"
    class={[
      themeButtonClasses,
      'flex items-center justify-center gap-2 border-gray-300 border-dashed text-sm hover:border-gray-500'
    ]}
    onclick={() => showThemeEditorDialog()}
  >
    <Fa icon={faPlus} />
    <span>New theme</span>
  </button>
</div>
