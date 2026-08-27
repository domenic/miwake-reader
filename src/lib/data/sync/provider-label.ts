import { SyncEndpointType } from '$lib/data/storage/storage-types';
import type { CloudProviderType } from '$lib/data/sync/sync-store.svelte';

export function providerLabel(provider: CloudProviderType): string {
  return provider === SyncEndpointType.GDRIVE ? 'Google Drive' : 'OneDrive';
}
