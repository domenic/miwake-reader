import type { BookmarkManager } from '$lib/components/book-reader/types';
import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import type { PageManagerPaginated } from './page-manager-paginated';
import type { SectionCharacterStatsCalculator } from './section-character-stats-calculator';

interface ReaderSectionState {
  sectionIndex: number;
}

interface BookmarkManagerPaginatedOptions {
  calculator: SectionCharacterStatsCalculator;
  pageManager: PageManagerPaginated;
  readerState: ReaderSectionState;
  setSectionIndexAndWait: (index: number) => Promise<SectionCharacterStatsCalculator>;
  setIntendedCharCount: (count: number) => void;
}

export class BookmarkManagerPaginated implements BookmarkManager {
  #calculator: SectionCharacterStatsCalculator;

  #pageManager: PageManagerPaginated;

  #readerState: ReaderSectionState;

  #setSectionIndexAndWait: (index: number) => Promise<SectionCharacterStatsCalculator>;

  #setIntendedCharCount: (count: number) => void;

  constructor({
    calculator,
    pageManager,
    readerState,
    setSectionIndexAndWait,
    setIntendedCharCount
  }: BookmarkManagerPaginatedOptions) {
    this.#calculator = calculator;
    this.#pageManager = pageManager;
    this.#readerState = readerState;
    this.#setSectionIndexAndWait = setSectionIndexAndWait;
    this.#setIntendedCharCount = setIntendedCharCount;
  }

  async scrollToBookmark(bookmarkData: BooksDbBookmarkData) {
    const charCount = bookmarkData.exploredCharCount;
    if (!charCount) return;

    const index = this.#calculator.getSectionIndexByCharCount(charCount);
    let calculator = this.#calculator;

    if (this.#readerState.sectionIndex !== index) {
      calculator = await this.#setSectionIndexAndWait(index);
    }

    const scrollPos = calculator.getScrollPosByCharCount(charCount);
    this.#pageManager.scrollTo(scrollPos, false);
    this.#setIntendedCharCount(charCount);
  }

  formatBookmarkData(bookTitle: string): BooksDbBookmarkData {
    return this.formatBookmarkDataByRange(bookTitle, undefined);
  }

  formatBookmarkDataByRange(
    bookTitle: string,
    customReadingPointRange: Range | undefined
  ): BooksDbBookmarkData {
    const exploredCharCount = this.#calculator.calcExploredCharCount(customReadingPointRange);
    const bookCharCount = this.#calculator.charCount;

    return {
      title: bookTitle,
      exploredCharCount,
      progress: exploredCharCount / bookCharCount,
      lastBookmarkModified: new Date().getTime()
    };
  }
}
