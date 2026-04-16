import { BlurMode } from '$lib/data/blur-mode';
import type { BooksDbBookData } from '$lib/data/database/books-db/versions/books-db';
import { Observable } from 'rxjs';
import { BaseStorageHandler } from '$lib/data/storage/handler/base-handler';
import buildDummyBookImage from '$lib/functions/file-loaders/utils/build-dummy-book-image';
import { isElementGaiji } from '$lib/functions/is-element-gaiji';
import { map } from 'rxjs/operators';
import {
  readerImageGalleryPictures$,
  type ReaderImageGalleryPicture
} from '$lib/components/book-reader/book-reader-image-gallery/book-reader-image-gallery';

export default function formatBookDataHtml(
  bookData: BooksDbBookData,
  document: Document,
  isPaginated: boolean,
  blurMode: BlurMode
) {
  return getHtmlWithImageSource(bookData).pipe(
    map(({ elementHtml, objectUrls, urlIndexes }) => {
      const element = document.createElement('div');
      element.innerHTML = elementHtml;

      addImageContainerClass(element);
      // combineImagePairs(element);
      removeSvgDimensions(element);
      addSpoilerTags(element, document, blurMode);
      removeOldBrTagSolution(element);
      publishImageGallery(element, objectUrls, urlIndexes, isPaginated);

      return element.innerHTML;
    })
  );
}

interface HtmlWithImageSource {
  elementHtml: string;
  objectUrls: string[];
  urlIndexes: Map<string, number>;
}

function getHtmlWithImageSource(bookData: BooksDbBookData) {
  return new Observable<HtmlWithImageSource>((subscriber) => {
    const { blobs } = bookData;
    const objectUrls: string[] = [];
    const urlIndexes = new Map<string, number>();

    let { elementHtml } = bookData;

    Object.entries(blobs).forEach(([key, value]) => {
      const url = URL.createObjectURL(
        value.type
          ? value
          : new Blob([value], { type: BaseStorageHandler.getImageMimeTypeFromExtension(key) })
      );
      const dummyUrl = buildDummyBookImage(key);

      objectUrls.push(url);
      urlIndexes.set(url, elementHtml.indexOf(dummyUrl));

      elementHtml = elementHtml.replaceAll(dummyUrl, url).replaceAll(`miwake:${key}`, url);
    });
    subscriber.next({ elementHtml, objectUrls, urlIndexes });

    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  });
}

function publishImageGallery(
  el: HTMLElement,
  objectUrls: string[],
  urlIndexes: Map<string, number>,
  isPaginated: boolean
) {
  const inlineImageUrls = new Set<string>();
  for (const img of el.getElementsByTagName('img')) {
    if (isImageInline(img)) {
      inlineImageUrls.add(img.src);
    }
  }

  const readerImageGalleryPictures: ReaderImageGalleryPicture[] = objectUrls
    .filter((url) => !inlineImageUrls.has(url))
    .map((url) => ({ url, unspoilered: !isPaginated }));

  readerImageGalleryPictures.sort((picture1, picture2) => {
    const index1 = urlIndexes.get(picture1.url) || 0;
    const index2 = urlIndexes.get(picture2.url) || 0;

    return index1 - index2;
  });

  readerImageGalleryPictures$.next(readerImageGalleryPictures);
}

function addImageContainerClass(el: HTMLElement) {
  for (const imgEl of el.getElementsByTagName('img')) {
    const parentEl = imgEl.parentElement!;
    parentEl.classList.add('ttu-img-container');

    if (!isImageInline(imgEl)) {
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

function removeSvgDimensions(el: HTMLElement) {
  for (const tag of el.getElementsByTagName('svg')) {
    tag.removeAttribute('width');
    tag.removeAttribute('height');
  }
}

function addSpoilerTags(el: HTMLElement, document: Document, blurMode: BlurMode) {
  const getChildNodesAfterTableOfContents = () => {
    const childNodes = [...el.children];
    const tocIndex = childNodes.findIndex(
      (childNode) => childNode.getElementsByTagName('a').length > 1
    );
    // Skip up to and including the TOC page, or just the cover (first child) if no TOC found
    const startIndex = tocIndex === -1 ? 1 : tocIndex + 1;
    return childNodes.slice(startIndex);
  };

  const createWrapper = (tag: Element, childNode: Element) => {
    const imgWrapper = document.createElement('span');
    const parentElement = tag.parentElement || childNode;

    imgWrapper.classList.add('ttu-img-parent');
    imgWrapper.toggleAttribute('data-miwake-spoiler-img');

    parentElement.insertBefore(imgWrapper, tag);
    imgWrapper.appendChild(tag);
  };

  (blurMode === BlurMode.AFTER_TOC
    ? getChildNodesAfterTableOfContents()
    : [...el.children]
  ).forEach((childNode) => {
    Array.from(childNode.getElementsByTagName('img'))
      .filter((tag) => !isImageInline(tag))
      .forEach((tag) => createWrapper(tag, childNode));

    Array.from(childNode.getElementsByTagName('svg'))
      .filter((tag) => tag.getElementsByTagName('image').length && !isImageInline(tag))
      .forEach((tag) => createWrapper(tag, childNode));
  });
}

function removeOldBrTagSolution(el: HTMLElement) {
  el.querySelectorAll('.placeholder-br').forEach((placeholderEl) => {
    placeholderEl.parentElement!.removeChild(placeholderEl);
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function combineImagePairs(el: HTMLElement) {
  const imagePairs: [Element, Element][] = [];

  let startingIndex = 1;

  if (el.children.item(0)?.id.startsWith('miwake-')) {
    // Skip first page (index 0) as it's probably cover
    startingIndex = 2;
  }

  for (let i = startingIndex; i < el.children.length; i += 2) {
    const leftChild = el.children.item(i - 1)!;
    const rightChild = el.children.item(i)!;

    if (
      hasNoText(leftChild) &&
      hasNoText(rightChild) &&
      hasSingleImage(leftChild) &&
      hasSingleImage(rightChild)
    ) {
      imagePairs.push([leftChild, rightChild]);
    }
  }

  if (
    imagePairs.some(([leftPair, rightPair]) => {
      const leftImages = leftPair.querySelectorAll('image');
      const rightImages = rightPair.querySelectorAll('image');

      if (leftImages.length !== 1 || rightImages.length !== 1) {
        // Not supported
        return true;
      }

      if (!isImagePortrait(leftImages[0]) || !isImagePortrait(rightImages[0])) {
        return true;
      }

      return false;
    })
  ) {
    return;
  }

  imagePairs.forEach(([leftPair, rightPair]) => {
    el.removeChild(rightPair);

    leftPair.classList.add('grouped-image');

    const images = extractImageChildren(leftPair).concat(extractImageChildren(rightPair));

    clearChildren(leftPair);

    images.forEach((image) => leftPair.appendChild(image));
  });
}

function hasNoText(el: Element) {
  return typeof el.textContent === 'string' ? el.textContent.trim().length === 0 : !el.textContent;
}

function getImageChildren(el: Element) {
  const imageChilds = el.querySelectorAll('svg');
  return imageChilds;
}

function hasSingleImage(el: Element) {
  return getImageChildren(el).length === 1;
}

function extractImageChildren(el: Element) {
  const imageChildren = getImageChildren(el);
  const result: Element[] = [];
  imageChildren.forEach((child) => {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
      result.push(child);
    }
  });
  return result;
}

function clearChildren(el: Element) {
  Array.from(el.children).forEach((child) => {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
  });
  return el;
}

function isImagePortrait(el: SVGImageElement) {
  return el.height.baseVal.value > el.width.baseVal.value;
}
