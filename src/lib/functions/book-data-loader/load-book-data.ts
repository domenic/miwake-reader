import { BlurMode } from '$lib/data/blur-mode';
import type { BooksDbBookData } from '$lib/data/database/books-db/versions/books-db';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import buildDummyBookImage from '$lib/functions/file-loaders/utils/build-dummy-book-image';
import { isElementGaiji } from '$lib/functions/is-element-gaiji';
import {
  readerImageGallery,
  type ReaderImageGalleryPicture
} from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery-state.svelte';
import { getImageURL } from '$lib/components/book-reader/image-url';
import formatStyleSheet from './format-style-sheet';

export interface LoadedBookData {
  htmlContent: string;
  styleSheet: string;
}

export default function loadBookData(
  bookData: BooksDbBookData,
  parentSelector: string,
  document: Document,
  blurMode: BlurMode
) {
  const { htmlContent, cleanup } = formatHTMLContent(bookData, document, blurMode);

  return {
    loadedBookData: {
      htmlContent,
      styleSheet: formatStyleSheet(bookData, parentSelector)
    },
    cleanup
  };
}

function formatHTMLContent(bookData: BooksDbBookData, document: Document, blurMode: BlurMode) {
  const { elementHTML, objectURLs } = getHTMLWithImageSource(bookData);

  try {
    const element = document.createElement('div');
    element.innerHTML = elementHTML;

    addImageContainerClass(element);
    removeSVGDimensions(element);
    addSpoilerTags(element, document, blurMode);
    removeOldBrTagSolution(element);
    publishImageGallery(element, new Set(objectURLs));

    return {
      htmlContent: element.innerHTML,
      cleanup: () => revokeObjectURLs(objectURLs)
    };
  } catch (error) {
    revokeObjectURLs(objectURLs);
    throw error;
  }
}

interface HTMLWithImageSource {
  elementHTML: string;
  objectURLs: string[];
}

function getHTMLWithImageSource(bookData: BooksDbBookData): HTMLWithImageSource {
  const objectURLs: string[] = [];

  let elementHTML = bookData.elementHtml;

  try {
    Object.entries(bookData.blobs).forEach(([key, value]) => {
      const url = createObjectURL(key, value);

      objectURLs.push(url);
      elementHTML = replaceImageReferences(elementHTML, key, url);
    });

    return { elementHTML, objectURLs };
  } catch (error) {
    revokeObjectURLs(objectURLs);
    throw error;
  }
}

function createObjectURL(key: string, value: Blob) {
  return URL.createObjectURL(
    value.type
      ? value
      : new Blob([value], { type: BaseStorageHandler.getImageMimeTypeFromExtension(key) })
  );
}

function replaceImageReferences(elementHTML: string, key: string, url: string) {
  const dummyURL = buildDummyBookImage(key);
  return elementHTML.replaceAll(dummyURL, url).replaceAll(`miwake:${key}`, url);
}

function revokeObjectURLs(objectURLs: string[]) {
  for (const url of objectURLs) {
    URL.revokeObjectURL(url);
  }
}

function publishImageGallery(el: HTMLElement, objectURLs: Set<string>) {
  readerImageGallery.setPictures(getReaderImageGalleryPictures(el, objectURLs));
}

function getReaderImageGalleryPictures(el: HTMLElement, objectURLs: Set<string>) {
  const picturesByURL = new Map<string, ReaderImageGalleryPicture>();
  const pictures: ReaderImageGalleryPicture[] = [];

  for (const imageElement of el.querySelectorAll('img, image')) {
    const imageURL = getImageURL(imageElement);

    if (!imageURL || !objectURLs.has(imageURL) || isGalleryInlineImage(imageElement)) {
      continue;
    }

    const unspoilered = !imageElement.closest('[data-miwake-spoiler-img]');
    const picture = picturesByURL.get(imageURL);

    if (picture) {
      picture.unspoilered &&= unspoilered;
      continue;
    }

    const newPicture = { url: imageURL, unspoilered };
    picturesByURL.set(imageURL, newPicture);
    pictures.push(newPicture);
  }

  return pictures;
}

function isGalleryInlineImage(imageElement: Element) {
  if (imageElement instanceof SVGImageElement) {
    return isImageInline(imageElement.closest('svg') ?? imageElement);
  }

  return isImageInline(imageElement);
}

function addImageContainerClass(el: HTMLElement) {
  for (const mediaEl of el.querySelectorAll('img, svg')) {
    const parentEl = mediaEl.parentElement;
    if (!parentEl) continue;

    parentEl.classList.add('ttu-img-container');

    if (!isImageInline(mediaEl)) {
      parentEl.classList.add('ttu-illustration-container');
    }
  }
}

function isImageInline(el: Element): boolean {
  if (el instanceof HTMLImageElement && isElementGaiji(el)) {
    return true;
  }

  const parent = el.parentElement;
  if (!parent) return false;

  for (const sibling of parent.childNodes) {
    if (sibling === el) continue;
    const text = sibling.textContent?.replace(/[\s\u3000]+/g, '');
    if (text) {
      return true;
    }
  }
  return false;
}

function removeSVGDimensions(el: HTMLElement) {
  for (const tag of el.getElementsByTagName('svg')) {
    tag.removeAttribute('width');
    tag.removeAttribute('height');
  }
}

function addSpoilerTags(el: HTMLElement, document: Document, blurMode: BlurMode) {
  if (blurMode === BlurMode.OFF) {
    return;
  }

  for (const childNode of getSpoilerCandidateChildren(el, blurMode)) {
    for (const tag of childNode.querySelectorAll('img, svg')) {
      if (shouldWrapSpoilerImage(tag)) {
        wrapSpoilerImage(tag, childNode, document);
      }
    }
  }
}

function getSpoilerCandidateChildren(el: HTMLElement, blurMode: BlurMode) {
  const childNodes = [...el.children];
  if (blurMode !== BlurMode.AFTER_TOC) {
    return childNodes;
  }

  const tocIndex = childNodes.findIndex(
    (childNode) => childNode.getElementsByTagName('a').length > 1
  );
  // Skip up to and including the TOC page, or just the cover (first child) if no TOC found
  const startIndex = tocIndex === -1 ? 1 : tocIndex + 1;
  return childNodes.slice(startIndex);
}

function shouldWrapSpoilerImage(tag: Element) {
  if (tag instanceof HTMLImageElement) {
    return !isImageInline(tag);
  }

  return (
    tag.localName === 'svg' && tag.getElementsByTagName('image').length > 0 && !isImageInline(tag)
  );
}

function wrapSpoilerImage(tag: Element, childNode: Element, document: Document) {
  const imgWrapper = document.createElement('span');
  const parentElement = tag.parentElement || childNode;

  imgWrapper.classList.add('ttu-img-parent');
  imgWrapper.toggleAttribute('data-miwake-spoiler-img', true);

  parentElement.insertBefore(imgWrapper, tag);
  imgWrapper.appendChild(tag);
}

function removeOldBrTagSolution(el: HTMLElement) {
  el.querySelectorAll('.placeholder-br').forEach((placeholderEl) => {
    placeholderEl.remove();
  });
}
