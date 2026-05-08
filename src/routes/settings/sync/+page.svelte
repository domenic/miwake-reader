<script lang="ts">
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import SyncAdvancedSection from '$lib/components/settings/sync/sync-advanced-section.svelte';
  import SyncDataManagementSection from '$lib/components/settings/sync/sync-data-management-section.svelte';
  import SyncLocationSection from '$lib/components/settings/sync/sync-location-section.svelte';
</script>

<svelte:head>
  <title>{formatPageTitle('Sync')}</title>
</svelte:head>

<div class="mx-auto max-w-2xl">
  <SyncLocationSection />
  <SyncDataManagementSection />
  <SyncAdvancedSection />
</div>
