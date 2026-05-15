export interface BackupBook {
  id: number;
  title: string;
  hasBookmark: boolean;
  hasStatistics: boolean;
}

export interface BackupCatalog {
  hasAppSettings: boolean;
  hasReadingGoals: boolean;
  books: BackupBook[];
}

export interface BackupSelection {
  appSettings: boolean;
  readingGoals: boolean;
  perBook: Map<number, { book: true; bookmarks: boolean; statistics: boolean }>;
}

export type BackupImportDirection = 'newest' | 'zip-wins';

export function isEmptySelection(sel: BackupSelection): boolean {
  return !sel.appSettings && !sel.readingGoals && sel.perBook.size === 0;
}
