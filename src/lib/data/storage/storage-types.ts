/**
 * Identifies a sync endpoint kind. The local-IDB side isn't here —
 * it's structurally a different thing (see LocalReplicationEndpoint
 * in src/lib/data/storage/handler/local-replication-endpoint.ts and
 * the role split in handler-roles.ts).
 */
export enum SyncEndpointType {
  BACKUP = 'backup',
  FS = 'fs',
  GDRIVE = 'gdrive',
  ONEDRIVE = 'onedrive'
}

/**
 * Lean shape a sync endpoint caches per remote book and returns from
 * listSyncTitles(): just enough to seed placeholder rows on the local
 * side. Distinct from BookCardProps (which the unified library view
 * uses) — the source's job is "tell me which titles you hold," not
 * "render a card." Handlers fill every field, using zero values for
 * whatever the source doesn't provide.
 */
export interface SyncTitle {
  title: string;
  characters: number;
  lastBookModified: number;
  lastBookOpen: number;
  /**
   * Cover image to surface in /manage's library view before the book
   * itself is downloaded, or '' when the source has none. Cloud
   * handlers populate this with their thumbnail URL (refreshed on
   * every boot reconcile, so staleness doesn't outlast a session); FS
   * handlers populate it with a Blob read from the cover_ file in the
   * book's directory.
   */
  coverImage: string | Blob;
  /**
   * Reading progress fields parsed from the source's progress_*
   * filename, so /manage can show real values on placeholder rows
   * instead of zeros until the user opens the book. The actual
   * scroll / char-count details still come down via the per-book
   * pull on open.
   */
  progress: number;
  lastBookmarkModified: number;
  completed: boolean;
}

export enum StorageDataType {
  DATA = 'data',
  PROGRESS = 'bookmark',
  STATISTICS = 'statistic',
  READING_GOALS = 'readingGoal'
}

export enum StorageSourceDefault {
  GDRIVE_DEFAULT = 'miwake-gdrive-default',
  ONEDRIVE_DEFAULT = 'miwake-onedrive-default'
}
