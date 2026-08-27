import type { BookReaderController } from '$lib/components/book-reader/book-reader-controller.svelte';
import { finishAppKeydown, shouldIgnoreAppKeydown } from '$lib/functions/keybind';

enum ReaderKeybindAction {
  AUTO_SCROLL_TOGGLE = 'autoScrollToggle',
  AUTO_SCROLL_INCREASE = 'autoScrollIncrease',
  AUTO_SCROLL_DECREASE = 'autoScrollDecrease',
  BOOKMARK = 'bookmark',
  JUMP_TO_BOOKMARK = 'jumpToBookmark',
  NEXT_CHAPTER = 'nextChapter',
  NEXT_PAGE = 'nextPage',
  PREV_CHAPTER = 'prevChapter',
  PREV_PAGE = 'prevPage',
  SET_READING_POINT = 'setCustomReadingPoint',
  TOGGLE_TRACKING = 'toggleTracking',
  TOGGLE_TRACKING_FREEZE = 'toggleTrackingFreeze'
}

type ReaderKeybindMap = Readonly<Record<string, ReaderKeybindAction>>;

interface ReaderKeybindOptions {
  bookmarkPage: () => void;
  changeChapter: (offset: number) => Promise<void>;
  freezeTrackerPosition: () => void;
  handleSetCustomReadingPoint: () => void;
  isPaginated: boolean;
  isVertical: boolean;
  multiplierOffsetFn: (offset: number) => void;
  readerController: BookReaderController;
  scrollToBookmark: () => void;
  shortcutsDisabled: boolean;
  toggleTracker: () => void;
}

const readerKeybindMap: ReaderKeybindMap = {
  b: ReaderKeybindAction.BOOKMARK,
  r: ReaderKeybindAction.JUMP_TO_BOOKMARK,
  PageDown: ReaderKeybindAction.NEXT_PAGE,
  PageUp: ReaderKeybindAction.PREV_PAGE,
  ' ': ReaderKeybindAction.AUTO_SCROLL_TOGGLE,
  n: ReaderKeybindAction.PREV_CHAPTER,
  m: ReaderKeybindAction.NEXT_CHAPTER,
  t: ReaderKeybindAction.SET_READING_POINT,
  p: ReaderKeybindAction.TOGGLE_TRACKING,
  f: ReaderKeybindAction.TOGGLE_TRACKING_FREEZE
};

const continuousReaderKeybindMap: ReaderKeybindMap = {
  a: ReaderKeybindAction.AUTO_SCROLL_INCREASE,
  d: ReaderKeybindAction.AUTO_SCROLL_DECREASE
};

const horizontalPaginatedReaderKeybindMap: ReaderKeybindMap = {
  a: ReaderKeybindAction.PREV_PAGE,
  ArrowLeft: ReaderKeybindAction.PREV_PAGE,
  d: ReaderKeybindAction.NEXT_PAGE,
  ArrowRight: ReaderKeybindAction.NEXT_PAGE,
  ArrowUp: ReaderKeybindAction.PREV_PAGE,
  ArrowDown: ReaderKeybindAction.NEXT_PAGE
};

const verticalPaginatedReaderKeybindMap: ReaderKeybindMap = {
  a: ReaderKeybindAction.NEXT_PAGE,
  ArrowLeft: ReaderKeybindAction.NEXT_PAGE,
  d: ReaderKeybindAction.PREV_PAGE,
  ArrowRight: ReaderKeybindAction.PREV_PAGE,
  ArrowUp: ReaderKeybindAction.PREV_PAGE,
  ArrowDown: ReaderKeybindAction.NEXT_PAGE
};

// Use `KeyboardEvent.key` so shortcuts are semantic/layout-aware; `code` is physical-key based.
export function handleReaderKeydown(ev: KeyboardEvent, options: ReaderKeybindOptions) {
  if (shouldIgnoreAppKeydown(ev, { shortcutsDisabled: options.shortcutsDisabled })) {
    return;
  }

  const action = getModeKeybindMap(options)[ev.key] ?? readerKeybindMap[ev.key];
  if (!action || ev.repeat) {
    return;
  }

  let completion: Promise<void> | undefined;
  let handled = true;
  switch (action) {
    case ReaderKeybindAction.BOOKMARK: {
      options.bookmarkPage();
      break;
    }
    case ReaderKeybindAction.JUMP_TO_BOOKMARK:
      options.scrollToBookmark();
      break;
    case ReaderKeybindAction.AUTO_SCROLL_TOGGLE:
      options.readerController.toggleAutoScrollIfAvailable();
      break;
    case ReaderKeybindAction.AUTO_SCROLL_INCREASE:
      options.multiplierOffsetFn(1);
      break;
    case ReaderKeybindAction.AUTO_SCROLL_DECREASE:
      options.multiplierOffsetFn(-1);
      break;
    case ReaderKeybindAction.NEXT_PAGE:
      handled = nextPageIfAvailable(options);
      break;
    case ReaderKeybindAction.PREV_PAGE:
      handled = prevPageIfAvailable(options);
      break;
    case ReaderKeybindAction.PREV_CHAPTER:
      completion = options.changeChapter(options.isVertical ? 1 : -1);
      break;
    case ReaderKeybindAction.NEXT_CHAPTER:
      completion = options.changeChapter(options.isVertical ? -1 : 1);
      break;
    case ReaderKeybindAction.SET_READING_POINT:
      options.handleSetCustomReadingPoint();
      break;
    case ReaderKeybindAction.TOGGLE_TRACKING:
      options.toggleTracker();
      break;
    case ReaderKeybindAction.TOGGLE_TRACKING_FREEZE:
      options.freezeTrackerPosition();
      break;
  }

  if (!handled) {
    return;
  }

  finishAppKeydown(ev);
  return completion;
}

function getModeKeybindMap(options: ReaderKeybindOptions) {
  if (!options.isPaginated) {
    return continuousReaderKeybindMap;
  }

  return options.isVertical
    ? verticalPaginatedReaderKeybindMap
    : horizontalPaginatedReaderKeybindMap;
}

function nextPageIfAvailable({ readerController }: ReaderKeybindOptions) {
  if (!readerController.canPage) {
    return false;
  }

  readerController.nextPage();
  return true;
}

function prevPageIfAvailable({ readerController }: ReaderKeybindOptions) {
  if (!readerController.canPage) {
    return false;
  }

  readerController.prevPage();
  return true;
}
