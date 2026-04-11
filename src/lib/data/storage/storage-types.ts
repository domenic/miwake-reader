export enum StorageKey {
  BACKUP = 'backup',
  BROWSER = 'browser',
  FS = 'fs',
  GDRIVE = 'gdrive',
  ONEDRIVE = 'onedrive'
}

export enum StorageDataType {
  DATA = 'data',
  PROGRESS = 'bookmark',
  STATISTICS = 'statistic',
  READING_GOALS = 'readingGoal',
  AUDIOBOOK = 'audioBook',
  SUBTITLE = 'subtitle'
}

export enum StorageSourceDefault {
  GDRIVE_DEFAULT = 'miwake-gdrive-default',
  ONEDRIVE_DEFAULT = 'miwake-onedrive-default'
}

export enum InternalStorageSources {
  INTERNAL_DEFAULT = 'miwake-internal-source',
  INTERNAL_BROWSER = 'miwake-internal-browser',
  INTERNAL_ZIP = 'miwake-internal-zip'
}

export const internalStorageSourceName = new Set<string>([
  InternalStorageSources.INTERNAL_DEFAULT,
  InternalStorageSources.INTERNAL_BROWSER,
  InternalStorageSources.INTERNAL_ZIP
]);

export const defaultStorageSources = [
  { name: StorageSourceDefault.GDRIVE_DEFAULT, type: StorageKey.GDRIVE },
  { name: StorageSourceDefault.ONEDRIVE_DEFAULT, type: StorageKey.ONEDRIVE }
];
