<script lang="ts">
  import SettingsRestoreDefaults from '$lib/components/settings/settings-restore-defaults.svelte';
  import SyncAdvancedSection from '$lib/components/settings/sync/sync-advanced-section.svelte';
  import SyncDataManagementSection from '$lib/components/settings/sync/sync-data-management-section.svelte';
  import SyncLocationSection from '$lib/components/settings/sync/sync-location-section.svelte';
  import { syncSettingsDefaults } from '$lib/data/settings-defaults';
  import {
    autoReplication$,
    cacheStorageData$,
    importHTMLFixMode$,
    readingGoalsMergeMode$,
    restrictImportFixToAnchor$,
    statisticsMergeMode$
  } from '$lib/data/store';
  import { formatPageTitle } from '$lib/functions/format-page-title';

  function restoreDefaults() {
    $autoReplication$ = syncSettingsDefaults.autoReplication;
    $statisticsMergeMode$ = syncSettingsDefaults.statisticsMergeMode;
    $readingGoalsMergeMode$ = syncSettingsDefaults.readingGoalsMergeMode;
    $cacheStorageData$ = syncSettingsDefaults.cacheStorageData;
    $importHTMLFixMode$ = syncSettingsDefaults.importHTMLFixMode;
    $restrictImportFixToAnchor$ = syncSettingsDefaults.restrictImportFixToAnchor;
  }
</script>

<svelte:head>
  <title>{formatPageTitle('Sync')}</title>
</svelte:head>

<!-- Unlike the mostly declarative settings pages, each Sync section owns substantial independent
     async workflows and state. Keep this route as their composition point instead of inlining them. -->
<SyncLocationSection />
<SyncDataManagementSection />
<SyncAdvancedSection />

<SettingsRestoreDefaults
  pageName="Sync"
  description="Returns the settings in Advanced to their original values without disconnecting sync locations or deleting data."
  message="This restores every setting in Advanced to its original value, including setting Sync direction to Both. Your sync locations remain connected, and no local or remote data will be deleted."
  onrestore={restoreDefaults}
/>
