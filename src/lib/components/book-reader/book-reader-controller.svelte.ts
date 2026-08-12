import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import type { AutoScroller, BookmarkManager, ChapterNavigator, PageManager } from './types';

export class BookReaderController {
  #autoScroller = $state<AutoScroller>();
  #bookmarkManager = $state<BookmarkManager>();
  #chapterNavigator: ChapterNavigator | undefined;
  #pageManager = $state<PageManager>();

  get autoScrollEnabled() {
    return this.#autoScroller?.enabled ?? false;
  }

  get canBookmark() {
    return !!this.#bookmarkManager;
  }

  get canPage() {
    return !!this.#pageManager;
  }

  registerAutoScroller(autoScroller: AutoScroller) {
    this.#autoScroller = autoScroller;

    return () => {
      autoScroller.destroy();
      if (this.#autoScroller === autoScroller) {
        this.#autoScroller = undefined;
      }
    };
  }

  registerBookmarkManager(bookmarkManager: BookmarkManager) {
    this.#bookmarkManager = bookmarkManager;

    return () => {
      if (this.#bookmarkManager === bookmarkManager) {
        this.#bookmarkManager = undefined;
      }
    };
  }

  registerChapterNavigator(chapterNavigator: ChapterNavigator) {
    this.#chapterNavigator = chapterNavigator;

    return () => {
      if (this.#chapterNavigator === chapterNavigator) {
        this.#chapterNavigator = undefined;
      }
    };
  }

  registerPageManager(pageManager: PageManager) {
    this.#pageManager = pageManager;

    return () => {
      if (this.#pageManager === pageManager) {
        this.#pageManager = undefined;
      }
    };
  }

  stopAutoScrollIfAvailable() {
    this.#autoScroller?.off();
  }

  toggleAutoScrollIfAvailable() {
    this.#autoScroller?.toggle();
  }

  nextPage() {
    this.#requirePageManager().nextPage();
  }

  prevPage() {
    this.#requirePageManager().prevPage();
  }

  updateSectionDataByOffset(offset: number) {
    this.#requirePageManager().updateSectionDataByOffset(offset);
  }

  formatBookmarkData(
    bookTitle: string,
    customReadingPointScrollOffset: number
  ): BooksDbBookmarkData {
    return this.#requireBookmarkManager().formatBookmarkData(
      bookTitle,
      customReadingPointScrollOffset
    );
  }

  formatBookmarkDataByRange(
    bookTitle: string,
    customReadingPointRange: Range | undefined
  ): BooksDbBookmarkData {
    return this.#requireBookmarkManager().formatBookmarkDataByRange(
      bookTitle,
      customReadingPointRange
    );
  }

  scrollToBookmark(bookmarkData: BooksDbBookmarkData, customReadingPointScrollOffset?: number) {
    this.#requireBookmarkManager().scrollToBookmark(bookmarkData, customReadingPointScrollOffset);
  }

  goToChapter(chapterId: string) {
    this.#requireChapterNavigator()(chapterId);
  }

  #requireBookmarkManager() {
    if (!this.#bookmarkManager) {
      throw new Error('Reader bookmark manager is not registered');
    }

    return this.#bookmarkManager;
  }

  #requireChapterNavigator() {
    if (!this.#chapterNavigator) {
      throw new Error('Reader chapter navigator is not registered');
    }

    return this.#chapterNavigator;
  }

  #requirePageManager() {
    if (!this.#pageManager) {
      throw new Error('Reader page manager is not registered');
    }

    return this.#pageManager;
  }
}
