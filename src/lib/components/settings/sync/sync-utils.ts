import { SyncEndpointType } from '$lib/data/storage/storage-types';
import type { CloudProviderType, SyncLocation } from '$lib/data/sync/sync-store.svelte';

export function providerLabel(provider: CloudProviderType): string {
  return provider === SyncEndpointType.GDRIVE ? 'Google Drive' : 'OneDrive';
}

/** "Google Drive" or "your sync folder (Books)", or "" if no location. */
export function describeSyncLocation(location: SyncLocation | null): string {
  if (!location) return '';
  if (location.kind === 'cloud') return providerLabel(location.provider);
  return `your sync folder (${location.path})`;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

/**
 * Format `timestamp` relative to `now` using Intl.RelativeTimeFormat,
 * with "just now" for anything under a minute (the API's "0 seconds
 * ago" / "now" is not great).
 */
export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = timestamp - now; // negative for past
  const absDiff = Math.abs(diff);
  if (absDiff < MINUTE) return 'just now';
  if (absDiff < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (absDiff < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  return rtf.format(Math.round(diff / DAY), 'day');
}
