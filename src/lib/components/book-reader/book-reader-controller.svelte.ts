import type { BooksDbBookmarkData } from '$lib/data/database/books-db/versions/books-db';
import type { AutoScroller, BookmarkManager, PageManager } from './types';

export class BookReaderController {
  #autoScroller = $state<AutoScroller>();
  #bookmarkManager = $state<BookmarkManager>();
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

  setAutoScroller(autoScroller: AutoScroller) {
    this.#autoScroller = autoScroller;
  }

  clearAutoScroller() {
    this.#autoScroller = undefined;
  }

  setBookmarkManager(bookmarkManager: BookmarkManager) {
    this.#bookmarkManager = bookmarkManager;
  }

  clearBookmarkManager() {
    this.#bookmarkManager = undefined;
  }

  setPageManager(pageManager: PageManager) {
    this.#pageManager = pageManager;
  }

  clearPageManager() {
    this.#pageManager = undefined;
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

  formatBookmarkData(bookId: number, customReadingPointScrollOffset: number): BooksDbBookmarkData {
    return this.#requireBookmarkManager().formatBookmarkData(
      bookId,
      customReadingPointScrollOffset
    );
  }

  formatBookmarkDataByRange(
    bookId: number,
    customReadingPointRange: Range | undefined
  ): BooksDbBookmarkData {
    return this.#requireBookmarkManager().formatBookmarkDataByRange(
      bookId,
      customReadingPointRange
    );
  }

  scrollToBookmark(bookmarkData: BooksDbBookmarkData, customReadingPointScrollOffset?: number) {
    this.#requireBookmarkManager().scrollToBookmark(bookmarkData, customReadingPointScrollOffset);
  }

  #requireBookmarkManager() {
    if (!this.#bookmarkManager) {
      throw new Error('Reader bookmark manager is not registered');
    }

    return this.#bookmarkManager;
  }

  #requirePageManager() {
    if (!this.#pageManager) {
      throw new Error('Reader page manager is not registered');
    }

    return this.#pageManager;
  }
}
