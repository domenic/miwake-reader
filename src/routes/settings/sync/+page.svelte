<script lang="ts">
  import { browser } from '$app/environment';
  import { formatPageTitle } from '$lib/functions/format-page-title';
  import SyncAdvancedSection from '$lib/components/settings/sync/sync-advanced-section.svelte';
  import SyncCloudSection from '$lib/components/settings/sync/sync-cloud-section.svelte';
  import SyncDataManagementSection from '$lib/components/settings/sync/sync-data-management-section.svelte';
  import SyncFileSystemSection from '$lib/components/settings/sync/sync-file-system-section.svelte';

  // The File System Access API isn't available in all browsers (Firefox
  // is the notable miss as of 2026). Hide the FS sync section entirely
  // rather than showing a connect button that throws on click.
  let supportsFsPicker = $derived(browser && 'showDirectoryPicker' in window);
</script>

<svelte:head>
  <title>{formatPageTitle('Sync')}</title>
</svelte:head>

<div class="mx-auto max-w-2xl">
  <SyncCloudSection />
  {#if supportsFsPicker}
    <SyncFileSystemSection />
  {/if}
  <SyncDataManagementSection />
  <SyncAdvancedSection />
</div>
