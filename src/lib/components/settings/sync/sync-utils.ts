import { StorageKey } from '$lib/data/storage/storage-types';
import type {
  CloudConnectionState,
  CloudProviderType,
  FsConnectionState
} from '$lib/data/sync/sync-store';

export function providerLabel(provider: CloudProviderType): string {
  return provider === StorageKey.GDRIVE ? 'Google Drive' : 'OneDrive';
}

function joinWithAnd(parts: string[]): string {
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  if (parts.length === 2) return `${parts[0]} and ${parts[1]}`;
  return `${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`;
}

/** "Google Drive and your local folder (/Users/…)", or "" if nothing is connected. */
export function describeSyncLocations(
  cloud: CloudConnectionState | null,
  fs: FsConnectionState | null
): string {
  const parts: string[] = [];
  if (cloud) parts.push(providerLabel(cloud.provider));
  if (fs) parts.push(`your local folder (${fs.path})`);
  return joinWithAnd(parts);
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
