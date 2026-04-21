import { StorageKey } from '$lib/data/storage/storage-types';
import type { CloudProviderType } from '$lib/data/sync/sync-store';

export function providerLabel(provider: CloudProviderType): string {
  return provider === StorageKey.GDRIVE ? 'Google Drive' : 'OneDrive';
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeTime(timestamp: number, now = Date.now()): string {
  const diff = now - timestamp;
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) {
    const minutes = Math.round(diff / MINUTE);
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (diff < DAY) {
    const hours = Math.round(diff / HOUR);
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }
  const days = Math.round(diff / DAY);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}
