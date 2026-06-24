import type { DBSchema } from 'idb';

interface BooksDbV3BookData {
  id: number;
  title: string;
  styleSheet: string;
  elementHtml: string;
  blobs: Record<string, Blob>;
  coverImage?: string | Blob;
  hasThumb: boolean;
  sections?: Section[];
  lastBookModified: number;
  lastBookOpen: number;
}

interface BooksDbV3BookmarkData {
  dataId: number;
  scrollX?: number;
  scrollY?: number;
  exploredCharCount?: number;
  progress: number | string | undefined;
  lastBookmarkModified: number;
}

interface BaseSection {
  reference: string;
  charactersWeight: number;
}

export interface ChapterSection extends BaseSection {
  label?: string;
  startCharacter: number;
  characters: number;
  parentChapter?: undefined;
}

export interface ChildSection extends BaseSection {
  parentChapter: string;
  label?: undefined;
  startCharacter?: undefined;
  characters?: undefined;
}

export type Section = ChapterSection | ChildSection;

export default interface BooksDbV3 extends DBSchema {
  data: {
    key: number;
    value: BooksDbV3BookData;
    indexes: {
      title: string;
    };
  };
  bookmark: {
    key: number;
    value: BooksDbV3BookmarkData;
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
}
