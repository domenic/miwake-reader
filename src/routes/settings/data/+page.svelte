<script lang="ts">
  import { onMount } from 'svelte';
  import { tap } from 'rxjs';
  import ButtonToggleGroup from '$lib/components/button-toggle-group/button-toggle-group.svelte';
  import {
    optionsForToggle,
    type ToggleOption
  } from '$lib/components/button-toggle-group/toggle-option';
  import SettingsItemGroup from '$lib/components/settings/settings-item-group.svelte';
  import SettingsStorageSourceList from '$lib/components/settings/settings-storage-source-list.svelte';
  import {
    ensureStorageSources,
    storageSources$
  } from '$lib/components/settings/settings-storage-sources';
  import { ImportHTMLFixMode } from '$lib/data/import-html-fix-mode';
  import { logger } from '$lib/data/logger';
  import { importHTMLFixMode$, restrictImportFixToAnchor$ } from '$lib/data/store';
  import { storage } from '$lib/data/window/navigator/storage';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';
  import { writableSubject } from '$lib/functions/svelte/store';

  const persistentStorage$ = writableSubject(false);
  let persistentStorageReactive = false;
  let storageQuota = $state('');

  onMount(() => {
    storage.persisted().then((p) => {
      logger.warn(`[persistent-storage] onMount: navigator.storage.persisted() = ${p}`);
      setPersistentStorage(p);
    });
    setStorageQuota();
    ensureStorageSources();
  });

  const setPersistentStorage$ = persistentStorage$.pipe(
    tap((value) => {
      if (!persistentStorageReactive) return;
      logger.warn(`[persistent-storage] toggle clicked: requesting value=${value}`);
      if (!value) {
        // The browser doesn't expose an API to *un*-persist; rolling
        // the toggle back to true preserves the user's existing grant.
        logger.warn('[persistent-storage] toggle off ignored: browser has no un-persist API');
        setPersistentStorage(true);
        return;
      }

      storage
        .persist()
        .then((granted) => {
          logger.warn(
            `[persistent-storage] navigator.storage.persist() resolved with granted=${granted}`
          );
          setPersistentStorage(granted);
        })
        .finally(setStorageQuota);
    }),
    reduceToEmptyString()
  );

  const optionsForImportHTMLFixes: ToggleOption<ImportHTMLFixMode>[] = [
    { id: ImportHTMLFixMode.OFF, text: 'Off' },
    { id: ImportHTMLFixMode.STANDARD, text: 'Standard' },
    { id: ImportHTMLFixMode.EXTENDED, text: 'Extended' }
  ];

  let persistentStorageTooltip = $derived(
    $persistentStorage$
      ? 'Reader uses higher storage limit for local data'
      : 'Uses lower temporary storage for local data.\nMay require bookmark or notification permissions for enablement'
  );
  let importHTMLFixModeTooltip = $derived.by(() => {
    switch ($importHTMLFixMode$) {
      case ImportHTMLFixMode.OFF:
        return 'Imports epub files as is';
      case ImportHTMLFixMode.EXTENDED:
        return 'Applies additional fixes for epub imports like removing control characters, replacing html entities etc.';
      default:
        return 'Applies fixes for epub imports like wrong self closing elements etc.';
    }
  });

  function setPersistentStorage(value: boolean) {
    persistentStorageReactive = false;
    persistentStorage$.next(value);
    persistentStorageReactive = true;
  }

  function setStorageQuota() {
    storage
      .estimate()
      .then((storageData) => {
        const { usage, quota } = storageData;

        if (usage === undefined || quota === undefined) {
          return;
        }

        storageQuota = `${Math.round(((usage / quota) * 100 + Number.EPSILON) * 100) / 100} % used`;
      })
      .catch(() => {
        // no-op
      });
  }
</script>

<svelte:head>
  <title>{formatPageTitle('Data Settings')}</title>
</svelte:head>

<div
  class="mx-auto mb-4 max-w-3xl rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
>
  <span class="font-medium">Sync controls have moved.</span>
  Auto-sync direction, merge modes, and cache now live on the new
  <a href="./sync" class="underline hover:no-underline" data-sveltekit-preload-data="hover">Sync</a>
  tab. The source-configuration list below remains here until phase 3 of the sync redesign replaces it
  with a Connect-based flow on the Sync tab.
</div>

<div class="grid grid-cols-1 items-center sm:grid-cols-2 sm:gap-6 lg:gap-8 lg:grid-cols-3">
  <SettingsItemGroup title="Persistent storage" tooltip={persistentStorageTooltip}>
    <div class="flex items-center">
      <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$persistentStorage$} />
      {#if storageQuota}
        <div class="ml-4">{storageQuota}</div>
      {/if}
    </div>
  </SettingsItemGroup>
  <SettingsItemGroup title="Epub Import Fixes" tooltip={importHTMLFixModeTooltip}>
    <ButtonToggleGroup
      options={optionsForImportHTMLFixes}
      bind:selectedOptionId={$importHTMLFixMode$}
    />
  </SettingsItemGroup>
  {#if $importHTMLFixMode$ !== ImportHTMLFixMode.OFF}
    <SettingsItemGroup
      title="Restrict to Links"
      tooltip="Restricts epub fixes for self closing tags to links only"
    >
      <ButtonToggleGroup
        options={optionsForToggle}
        bind:selectedOptionId={$restrictImportFixToAnchor$}
      />
    </SettingsItemGroup>
  {/if}
  <SettingsStorageSourceList storageSources={$storageSources$} />
</div>

{$setPersistentStorage$ ?? ''}
