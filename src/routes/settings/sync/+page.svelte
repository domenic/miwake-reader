<script lang="ts">
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import SyncAdvancedSection from '$lib/components/settings/sync/sync-advanced-section.svelte';
  import SyncCloudSection from '$lib/components/settings/sync/sync-cloud-section.svelte';
  import SyncDataManagementSection from '$lib/components/settings/sync/sync-data-management-section.svelte';
  import SyncFilesystemSection from '$lib/components/settings/sync/sync-filesystem-section.svelte';
</script>

<svelte:head>
  <title>{formatPageTitle('Sync')}</title>
</svelte:head>

<div class="mx-auto max-w-3xl py-4">
  <h1 class="mb-6 text-2xl font-medium text-black">Sync</h1>
  <SyncCloudSection />
  <SyncFilesystemSection />
  <SyncAdvancedSection />
  <SyncDataManagementSection />
</div>
