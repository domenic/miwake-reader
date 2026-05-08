import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-manager';

import type { DBSchema } from 'idb';
import type { ReadingGoal } from '$lib/data/reading-goal';
import type { SyncEndpointType } from '$lib/data/storage/storage-types';

interface BooksDbV7BookData {
  id: number;
  title: string;
  language?: string;
  styleSheet: string;
  elementHtml: string;
  blobs: Record<string, Blob>;
  coverImage?: string | Blob;
  hasThumb: boolean;
  characters: number;
  sections?: Section[];
  lastBookModified: number;
  lastBookOpen: number;
  htmlBackup?: string;
}

interface BooksDbV7BookmarkData {
  dataId: number;
  scrollX?: number;
  scrollY?: number;
  exploredCharCount?: number;
  progress: number | string | undefined;
  completed?: boolean;
  lastBookmarkModified: number;
}

interface BooksDbV7StorageSource {
  name: string;
  type: SyncEndpointType;
  data: FsHandle | RemoteContext;
  lastSourceModified: number;
}

interface BooksDbV7Statistic {
  title: string;
  dateKey: string;
  charactersRead: number;
  readingTime: number;
  minReadingSpeed: number;
  altMinReadingSpeed: number;
  lastReadingSpeed: number;
  maxReadingSpeed: number;
  lastStatisticModified: number;
  completedBook?: number;
  completedData?: Omit<BooksDbV7Statistic, 'title' | 'lastStatisticModified'>;
}

interface BooksDbV7ReadingGoal extends ReadingGoal {
  goalEndDate: string;
  goalOriginalEndDate: string;
}

interface BooksDbV7LastModified {
  title: string;
  dataType: string;
  lastModifiedValue: number;
}

export interface Section {
  reference: string;
  charactersWeight: number;
  label?: string;
  startCharacter?: number;
  characters?: number;
  parentChapter?: string;
}

export default interface BooksDbV7 extends DBSchema {
  data: {
    key: number;
    value: BooksDbV7BookData;
    indexes: {
      title: string;
    };
  };
  bookmark: {
    key: number;
    value: BooksDbV7BookmarkData;
    indexes: {
      dataId: number;
    };
  };
  lastItem: {
    key: number;
    value: {
      dataId: number;
    };
  };
  storageSource: {
    key: string;
    value: BooksDbV7StorageSource;
  };
  statistic: {
    key: string[];
    value: BooksDbV7Statistic;
    indexes: {
      dateKey: string;
      completedBook: (string | number | [])[];
    };
  };
  readingGoal: {
    key: string;
    value: BooksDbV7ReadingGoal;
    indexes: {
      goalEndDate: string;
    };
  };
  lastModified: {
    key: string[];
    value: BooksDbV7LastModified;
  };
}
