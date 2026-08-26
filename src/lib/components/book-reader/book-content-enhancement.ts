import type { Attachment } from 'svelte/attachments';
import { FuriganaStyle, setupRubyClickListeners } from '../../data/furigana-style';
import { pulseElement } from '$lib/functions/range-util';
import { readerImageGallery } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery-state.svelte';
import { getImageURL } from './image-url';
import type { BookReaderController } from './book-reader-controller.svelte';

interface EnhanceBookContentOptions {
  readerController: BookReaderController;
  furiganaStyle: FuriganaStyle;
  hideSpoilerImage: boolean;
  isPWADisplayMode: boolean;
}

export function enhanceBookContent({
  readerController,
  furiganaStyle,
  hideSpoilerImage,
  isPWADisplayMode
}: EnhanceBookContentOptions): Attachment<HTMLElement> {
  return (contentEl) => {
    const abortController = new AbortController();
    const { signal } = abortController;

    setupAnchorClickListeners(contentEl, readerController, signal);
    const cleanups = [
      setupRubyClickListeners(contentEl, furiganaStyle),
      setupSpoilerImageListeners(contentEl, signal),
      setupLongPressImageOpen(contentEl, hideSpoilerImage, isPWADisplayMode, signal)
    ];

    return () => {
      abortController.abort();
      cleanups.forEach((cleanup) => cleanup());
    };
  };
}

function setupAnchorClickListeners(
  contentEl: HTMLElement,
  readerController: BookReaderController,
  signal: AbortSignal
) {
  const document = contentEl.ownerDocument;

  for (const el of contentEl.getElementsByTagName('a')) {
    el.href = document.location.pathname + el.hash;
    el.addEventListener(
      'click',
      (ev) => {
        ev.preventDefault();
        ev.stopImmediatePropagation();

        readerController.goToChapter(el.hash.substring(1));
      },
      { signal }
    );
  }
}

export function setupSpoilerImageListeners(contentEl: HTMLElement, signal: AbortSignal) {
  const cleanups = Array.from(contentEl.querySelectorAll('[data-miwake-spoiler-img]')).map((el) =>
    setupSpoilerImageListener(el, signal)
  );

  return () => cleanups.forEach((cleanup) => cleanup());
}

function setupSpoilerImageListener(el: Element, signal: AbortSignal) {
  const document = el.ownerDocument;
  const spoilerLabelEl = document.createElement('span');
  const spoilerLabelTextEl = document.createElement('span');
  spoilerLabelEl.title = 'Show Image';
  spoilerLabelEl.classList.add('spoiler-label');
  spoilerLabelEl.setAttribute('aria-hidden', 'true');
  spoilerLabelTextEl.lang = 'ja';
  spoilerLabelTextEl.textContent = 'ネタバレ';
  spoilerLabelEl.append(spoilerLabelTextEl);
  el.appendChild(spoilerLabelEl);

  const imageElement = el.querySelector('img,image');

  function revealSpoilerImage(ev: Event) {
    ev.preventDefault();
    ev.stopImmediatePropagation();

    el.removeEventListener('click', revealSpoilerImage);
    spoilerLabelEl.remove();
    el.removeAttribute('data-miwake-spoiler-img');

    imageElement?.classList.add('ttu-unspoilered');

    revealImageGalleryPicture(imageElement);
  }

  el.addEventListener('click', revealSpoilerImage, { once: true, signal });

  return () => spoilerLabelEl.remove();
}

function setupLongPressImageOpen(
  contentEl: HTMLElement,
  hideSpoilerImage: boolean,
  isPWADisplayMode: boolean,
  signal: AbortSignal
) {
  const cleanupActiveGestures: Array<() => void> = [];

  // SVG `image` elements do not get useful native image affordances, so they always get the
  // long-press opener. HTML `img` keeps normal browser behavior except in installed PWA display
  // mode, where mobile browsers have historically lacked reliable open-in-tab or pinch-zoom paths.
  const imageSelector = isPWADisplayMode ? 'img,image' : 'image';

  for (const elm of contentEl.querySelectorAll<HTMLElement>(imageSelector)) {
    elm.draggable = false;
    cleanupActiveGestures.push(
      setupLongPressImage(elm, hideSpoilerImage, isPWADisplayMode, signal)
    );
  }

  return () => cleanupActiveGestures.forEach((cleanup) => cleanup());
}

function setupLongPressImage(
  elm: HTMLElement,
  hideSpoilerImage: boolean,
  isPWADisplayMode: boolean,
  signal: AbortSignal
) {
  let cleanupActiveGesture: (() => void) | undefined;

  elm.addEventListener(
    'contextmenu',
    (event) => {
      if (isPWADisplayMode) {
        event.preventDefault();
      }
    },
    { signal }
  );

  elm.addEventListener(
    'pointerdown',
    (event) => {
      cleanupActiveGesture?.();
      cleanupActiveGesture = setupImageLongPressGesture(elm, event, hideSpoilerImage);
    },
    { signal }
  );

  return () => cleanupActiveGesture?.();
}

function setupImageLongPressGesture(
  elm: HTMLElement,
  initialEvent: PointerEvent,
  hideSpoilerImage: boolean
) {
  const abortController = new AbortController();
  const ownerWindow = elm.ownerDocument.defaultView;
  if (!ownerWindow) return () => {};

  const initialX = initialEvent.clientX;
  const initialY = initialEvent.clientY;
  let cleanupOpenOnGestureEnd: (() => void) | undefined;
  let longPressTimer: number | undefined = ownerWindow.setTimeout(() => {
    longPressTimer = undefined;
    abortController.abort();

    if (
      hideSpoilerImage &&
      !elm.classList.contains('ttu-unspoilered') &&
      elm.closest('span[data-miwake-spoiler-img]')
    ) {
      return;
    }

    pulseElement(
      elm.parentElement && elm.localName === 'image' ? elm.parentElement : elm,
      'add',
      0.5,
      500
    );

    cleanupOpenOnGestureEnd = openImageOnGestureEnd(elm);
  }, 1000);

  const cancelGesture = () => {
    if (longPressTimer !== undefined) {
      ownerWindow.clearTimeout(longPressTimer);
      longPressTimer = undefined;
    }

    abortController.abort();
    cleanupOpenOnGestureEnd?.();
    cleanupOpenOnGestureEnd = undefined;
  };

  ownerWindow.addEventListener(
    'pointermove',
    (event) => {
      if (Math.abs(initialX - event.clientX) > 5 || Math.abs(initialY - event.clientY) > 5) {
        cancelGesture();
      }
    },
    { signal: abortController.signal }
  );
  ownerWindow.addEventListener('pointerup', cancelGesture, { signal: abortController.signal });
  ownerWindow.addEventListener('pointercancel', cancelGesture, { signal: abortController.signal });

  return cancelGesture;
}

function openImageOnGestureEnd(elm: HTMLElement) {
  const abortController = new AbortController();
  const ownerWindow = elm.ownerDocument.defaultView;
  if (!ownerWindow) return () => {};

  const openImage = () => {
    abortController.abort();

    const src = elm.getAttribute('src') || elm.getAttribute('href');
    if (src) {
      ownerWindow.open(src, '_blank');
    }
  };

  ownerWindow.addEventListener('pointerup', openImage, { signal: abortController.signal });
  ownerWindow.addEventListener('pointercancel', openImage, { signal: abortController.signal });

  return () => abortController.abort();
}

function revealImageGalleryPicture(imageElement: Element | null) {
  const imageURL = getImageURL(imageElement);
  if (imageURL) readerImageGallery.revealPicture(imageURL);
}
