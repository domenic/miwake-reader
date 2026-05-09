import { SyncEndpointType, StorageSourceDefault } from '$lib/data/storage/storage-types';
import type { CloudProviderType } from '$lib/data/sync/sync-store';

/** Sentinel record name for the single filesystem slot. */
export const FS_SOURCE_NAME = 'miwake-fs';

/**
 * When connecting a cloud provider, we reuse the existing pre-configured
 * default sentinel for the miwake-default OAuth case (so
 * `StorageOAuthManager` picks up the env.ts client credentials) or a
 * parallel `*-custom` name for user-supplied credentials.
 */
export function cloudSourceName(provider: CloudProviderType, custom: boolean): string {
  if (provider === SyncEndpointType.GDRIVE) {
    return custom ? 'miwake-gdrive-custom' : StorageSourceDefault.GDRIVE_DEFAULT;
  }
  return custom ? 'miwake-onedrive-custom' : StorageSourceDefault.ONEDRIVE_DEFAULT;
}

export function isCustomCloudName(name: string): boolean {
  return name === 'miwake-gdrive-custom' || name === 'miwake-onedrive-custom';
}

import { get as svelteGet, type Readable } from 'svelte/store';

/**
 * Synchronously read the current value from any Svelte-writable-shaped
 * store. Works for plain `writable()`s as well as the BehaviorSubject
 * wrappers (`writableSubject`) used elsewhere — svelte/store's `get`
 * handles both the function-returning subscribe contract and the
 * Subscription-returning RxJS shape. The parameter is `unknown`
 * because RxJS BehaviorSubject's typed-subscribe doesn't structurally
 * match `Readable<T>` even though it works at runtime.
 */
export function readSubject<T>(subject: unknown): T {
  return svelteGet(subject as Readable<T>);
}
