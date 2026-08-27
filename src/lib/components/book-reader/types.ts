import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';

export interface AutoScroller {
  readonly enabled: boolean;
  toggle: () => void;
  off: () => void;
  destroy: () => void;
}

export type ChapterNavigator = (chapterId: string) => void | Promise<void>;

export interface BookmarkManager {
  formatBookmarkData: (
    bookTitle: string,
    customReadingPointScrollOffset: number
  ) => BooksDbBookmarkData;

  formatBookmarkDataByRange: (
    bookTitle: string,
    customReadingPointRange: Range | undefined
  ) => BooksDbBookmarkData;

  scrollToBookmark: (
    bookmarkData: BooksDbBookmarkData,
    customReadingPointScrollOffset?: number
  ) => void;
}

export interface PageManager {
  nextPage: () => void;

  prevPage: () => void;

  updateSectionDataByOffset: (offset: number) => void;
}
