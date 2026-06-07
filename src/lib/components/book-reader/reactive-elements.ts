import {
  Observable,
  filter,
  fromEvent,
  merge,
  race,
  switchMap,
  take,
  takeUntil,
  tap,
  throttleTime,
  timer
} from 'rxjs';

import { FuriganaStyle, setupRubyClickListeners } from '../../data/furigana-style';
import { nextChapter$ } from '$lib/components/book-reader/book-toc/book-toc';
import { pulseElement } from '$lib/functions/range-util';
import { readerImageGallery } from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery-state.svelte';

export function reactiveElements(
  document: Document,
  furiganaStyle: FuriganaStyle,
  hideSpoilerImage: boolean,
  isExtendedMode: boolean
) {
  const anchorTagDocumentListener = anchorTagListener(document);

  return (contentEl: HTMLElement) =>
    merge(
      anchorTagDocumentListener(contentEl),
      rubyTagListener(contentEl, furiganaStyle),
      new Observable<never>(() => setupSpoilerImageListeners(document, contentEl)),
      openImageInNewTab(contentEl, hideSpoilerImage, isExtendedMode)
    );
}

function anchorTagListener(document: Document) {
  return (contentEl: HTMLElement) => {
    const anchorTags = Array.from(contentEl.getElementsByTagName('a'));
    anchorTags.forEach((el) => {
      el.href = document.location.pathname + el.hash;
    });

    const obs$ = anchorTags.map((el) =>
      fromClickEvent(el).pipe(tap(() => nextChapter$.next(el.hash.substring(1))))
    );
    return merge(...obs$);
  };
}

function rubyTagListener(contentEl: HTMLElement, furiganaStyle: FuriganaStyle) {
  return new Observable<never>(() => setupRubyClickListeners(contentEl, furiganaStyle));
}

function setupSpoilerImageListeners(document: Document, contentEl: HTMLElement) {
  const cleanups = Array.from(contentEl.querySelectorAll('[data-miwake-spoiler-img]')).map((el) =>
    setupSpoilerImageListener(document, el)
  );

  return () => cleanups.forEach((cleanup) => cleanup());
}

function setupSpoilerImageListener(document: Document, el: Element) {
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

  el.addEventListener('click', revealSpoilerImage);

  return () => {
    el.removeEventListener('click', revealSpoilerImage);
    spoilerLabelEl.remove();
  };
}

function openImageInNewTab(
  contentEl: HTMLElement,
  hideSpoilerImage: boolean,
  isExtendedMode: boolean
) {
  return merge(
    ...[...contentEl.querySelectorAll<HTMLElement>(`${isExtendedMode ? 'img,' : ''}image`)].map(
      (elm) => {
        elm.draggable = false;

        return merge(
          fromEvent(elm, 'contextmenu').pipe(
            tap((event) => {
              if (isExtendedMode) {
                event.preventDefault();
              }
            })
          ),
          fromEvent(elm, 'pointerdown').pipe(
            switchMap((event) => {
              const { clientX, clientY } = event as PointerEvent;

              return timer(1000).pipe(
                takeUntil(
                  race(
                    fromEvent(elm, 'pointermove').pipe(
                      throttleTime(200, undefined, { trailing: true }),
                      filter((event2) => {
                        const { clientX: newX, clientY: newY } = event2 as PointerEvent;

                        return Math.abs(clientX - newX) > 5 || Math.abs(clientY - newY) > 5;
                      })
                    ),
                    fromEvent(elm, 'pointerup'),
                    fromEvent(elm, 'pointercancel')
                  )
                )
              );
            }),
            filter(
              () =>
                !hideSpoilerImage ||
                elm.classList.contains('ttu-unspoilered') ||
                !elm.closest('span[data-miwake-spoiler-img]')
            ),
            switchMap(() => {
              pulseElement(
                elm.parentElement && elm.tagName.toLowerCase() === 'image'
                  ? elm.parentElement
                  : elm,
                'add',
                0.5,
                500
              );

              return merge(fromEvent(elm, 'pointerup'), fromEvent(elm, 'pointercancel')).pipe(
                take(1),
                tap(() => {
                  const src = elm.getAttribute('src') || elm.getAttribute('href');

                  if (src) {
                    window.open(src, '_blank');
                  }
                })
              );
            })
          )
        );
      }
    )
  );
}

function revealImageGalleryPicture(imageElement: Element | null) {
  const imageURL = getImageURL(imageElement);
  if (imageURL) readerImageGallery.revealPicture(imageURL);
}

function getImageURL(imageElement: Element | null) {
  if (imageElement instanceof HTMLImageElement) return imageElement.src;
  const imageURL = imageElement?.getAttribute('href') || imageElement?.getAttribute('xlink:href');
  if (imageURL) return imageURL;
  if (imageElement && 'href' in imageElement) {
    return (imageElement.href as SVGAnimatedString).baseVal;
  }
  return undefined;
}

function fromClickEvent(el: Element) {
  return fromEvent(el, 'click').pipe(
    tap((ev) => {
      ev.preventDefault();
      ev.stopImmediatePropagation();
    })
  );
}
