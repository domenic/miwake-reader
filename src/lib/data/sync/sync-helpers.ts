import { StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';
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
  if (provider === StorageKey.GDRIVE) {
    return custom ? 'miwake-gdrive-custom' : StorageSourceDefault.GDRIVE_DEFAULT;
  }
  return custom ? 'miwake-onedrive-custom' : StorageSourceDefault.ONEDRIVE_DEFAULT;
}

export function isCustomCloudName(name: string): boolean {
  return name === 'miwake-gdrive-custom' || name === 'miwake-onedrive-custom';
}

// `*$` stores in this codebase are BehaviorSubjects with `.getValue()`
// and `.next()`. TypeScript's exports don't expose `.getValue()`
// (they're typed as the wider writable interface) so we cast at the
// call sites.
type SubjectReader<T> = { getValue(): T };
export function readSubject<T>(subject: unknown): T {
  return (subject as SubjectReader<T>).getValue();
}
