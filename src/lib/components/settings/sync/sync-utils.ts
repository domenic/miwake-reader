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
