/**
 * Identifies a sync endpoint kind. The local library isn't here —
 * it's structurally a different thing (see Library in
 * src/lib/data/storage/library.ts and the role split in handler-roles.ts).
 */
export enum StorageKey {
  BACKUP = 'backup',
  FS = 'fs',
  GDRIVE = 'gdrive',
  ONEDRIVE = 'onedrive'
}

/**
 * Lean shape returned by a sync endpoint's listSyncTitles(): just
 * enough to seed placeholder rows on the local side. Distinct from
 * BookCardProps (which the unified library view uses) — the source's
 * job is "tell me which titles you hold," not "render a card."
 */
export interface SyncTitle {
  title: string;
  characters?: number;
  lastBookModified?: number;
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
