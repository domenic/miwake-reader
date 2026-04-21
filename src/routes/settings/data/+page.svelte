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
  import {
    autoReplication$,
    cacheStorageData$,
    importHTMLFixMode$,
    replicationSaveBehavior$,
    restrictImportFixToAnchor$,
    showExternalPlaceholder$
  } from '$lib/data/store';
  import { storage } from '$lib/data/window/navigator/storage';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import {
    ReplicationSaveBehavior,
    AutoReplicationType
  } from '$lib/functions/replication/replication-options';
  import { reduceToEmptyString } from '$lib/functions/rxjs/reduce-to-empty-string';
  import { writableSubject } from '$lib/functions/svelte/store';

  const persistentStorage$ = writableSubject(false);
  let persistentStorageReactive = false;
  let storageQuota = $state('');

  onMount(() => {
    storage.persisted().then(setPersistentStorage);
    setStorageQuota();
    ensureStorageSources();
  });

  const setPersistentStorage$ = persistentStorage$.pipe(
    tap((value) => {
      if (!persistentStorageReactive) return;
      if (!value) {
        setPersistentStorage(true);
        return;
      }

      storage.persist().then(setPersistentStorage).finally(setStorageQuota);
    }),
    reduceToEmptyString()
  );

  const optionsForImportHTMLFixes: ToggleOption<ImportHTMLFixMode>[] = [
    { id: ImportHTMLFixMode.OFF, text: 'Off' },
    { id: ImportHTMLFixMode.STANDARD, text: 'Standard' },
    { id: ImportHTMLFixMode.EXTENDED, text: 'Extended' }
  ];

  const optionsForAutoReplicationType: ToggleOption<AutoReplicationType>[] = [
    { id: AutoReplicationType.Off, text: 'Off' },
    { id: AutoReplicationType.Up, text: 'Up' },
    { id: AutoReplicationType.Down, text: 'Down' },
    { id: AutoReplicationType.All, text: 'All' }
  ];

  const optionsForReplicationSaveBehavior: ToggleOption<ReplicationSaveBehavior>[] = [
    { id: ReplicationSaveBehavior.NewOnly, text: 'New Only' },
    { id: ReplicationSaveBehavior.Overwrite, text: 'Overwrite' }
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
  let cacheStorageDataTooltip = $derived(
    $cacheStorageData$
      ? 'Storage data is cached. Saves network traffic/latency but requires to reload current/open a new tab to retrieve data changes'
      : 'Storage data is refetched on every action. May consume more network traffic/latency but ensures current data'
  );
  let replicationSaveBehaviorTooltip = $derived(
    $replicationSaveBehavior$ === ReplicationSaveBehavior.Overwrite
      ? 'Data will always be overwritten'
      : 'Data will only be written if none exist on target, no time data is present or if target data is older'
  );
  let autoReplicationTypeTooltip = $derived.by(() => {
    switch ($autoReplication$) {
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
    $showExternalPlaceholder$
      ? 'Placeholder data for external books is shown in the browser source manager'
      : 'Placeholder data for external books is hidden'
  );

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
  <span class="font-medium">This page is being replaced.</span>
  The sync-related settings here are moving to the new
  <a href="./sync" class="underline hover:no-underline" data-sveltekit-preload-data="hover">Sync</a>
  tab as part of the ongoing sync redesign (see
  <span class="font-mono">docs/storage-redesign.md</span>). The two screens coexist for now; only
  the new one reflects the target UI.
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
  <SettingsItemGroup title="Cache Data" tooltip={cacheStorageDataTooltip}>
    <ButtonToggleGroup options={optionsForToggle} bind:selectedOptionId={$cacheStorageData$} />
  </SettingsItemGroup>
  <SettingsItemGroup title="Auto Import/Export" tooltip={autoReplicationTypeTooltip}>
    <ButtonToggleGroup
      options={optionsForAutoReplicationType}
      bind:selectedOptionId={$autoReplication$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup title="Import/Export Behavior" tooltip={replicationSaveBehaviorTooltip}>
    <ButtonToggleGroup
      options={optionsForReplicationSaveBehavior}
      bind:selectedOptionId={$replicationSaveBehavior$}
    />
  </SettingsItemGroup>
  <SettingsItemGroup title="Show Placeholder" tooltip={showExternalPlaceholderToolTip}>
    <ButtonToggleGroup
      options={optionsForToggle}
      bind:selectedOptionId={$showExternalPlaceholder$}
    />
  </SettingsItemGroup>
  <SettingsStorageSourceList storageSources={$storageSources$} />
</div>

{$setPersistentStorage$ ?? ''}
