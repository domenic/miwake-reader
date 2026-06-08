import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  importBookFixtures,
  openBookFromManage,
  SPOILER_IMAGE_GALLERY_BOOK
} from '../helpers/fixtures.ts';
import {
  readerImage,
  readerImageURL,
  readerSVGImageURL,
  showReaderHeader
} from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

const COVER_ALT = 'Cover before spoilers';
const INLINE_ALT = 'Inline marker';
const SVG_LABEL = 'SVG before spoilers';
const SPOILER_ONE_ALT = 'Spoiler illustration one';
const SPOILER_TWO_ALT = 'Spoiler illustration two';

test('spoiler image gallery mirrors reader-side spoiler reveal state', async ({ page }) => {
  await useReaderSettings(page, { viewMode: 'Continuous' });
  await importBookFixtures(page, [SPOILER_IMAGE_GALLERY_BOOK]);
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);
  await expectBookReaderText(page, SPOILER_IMAGE_GALLERY_BOOK);

  await expect(readerSpoilerWrappers(page)).toHaveCount(2);
  await expect(readerSpoilerWrapper(page, COVER_ALT)).toHaveCount(0);
  await expect(readerSpoilerWrapper(page, INLINE_ALT)).toHaveCount(0);
  await expect(readerSpoilerWrapper(page, SPOILER_ONE_ALT)).toHaveCount(1);
  await expect(readerSpoilerWrapper(page, SPOILER_TWO_ALT)).toHaveCount(1);

  await openImageGallery(page);

  const coverURL = await readerImageURL(page, COVER_ALT);
  const svgURL = await readerSVGImageURL(page, SVG_LABEL);
  const inlineURL = await readerImageURL(page, INLINE_ALT);
  const spoilerOneURL = await readerImageURL(page, SPOILER_ONE_ALT);
  const spoilerTwoURL = await readerImageURL(page, SPOILER_TWO_ALT);
  const galleryImageURLs = await page
    .getByRole('img', { name: /^Gallery image \d+$/ })
    .evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src));

  expect(galleryImageURLs).toEqual([coverURL, svgURL, spoilerOneURL, spoilerTwoURL]);
  expect(galleryImageURLs).not.toContain(inlineURL);

  await expect(page.getByRole('button', { name: 'Reveal gallery image 1' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reveal gallery image 2' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reveal gallery image 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal gallery image 4' })).toBeVisible();

  await closeImageGallery(page);
  await revealReaderImage(page, SPOILER_ONE_ALT);
  await openImageGallery(page);

  await expect(page.getByRole('button', { name: 'Reveal gallery image 3' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reveal gallery image 4' })).toBeVisible();

  await page.getByRole('button', { name: 'Reveal gallery image 4' }).click();
  await expect(page.getByRole('button', { name: 'Reveal gallery image 4' })).toHaveCount(0);

  await closeImageGallery(page);
  await expect(readerSpoilerWrapper(page, SPOILER_TWO_ALT)).toHaveCount(1);
});

async function openImageGallery(page: Page) {
  await showReaderHeader(page);
  await page.getByRole('button', { name: 'Images' }).click();
  await expect(page.getByTitle('Close image gallery')).toBeVisible();
}

async function closeImageGallery(page: Page) {
  await page.getByTitle('Close image gallery').click();
  await expect(page.getByTitle('Close image gallery')).toHaveCount(0);
}

async function revealReaderImage(page: Page, imageAlt: string) {
  const wrapper = readerSpoilerWrapper(page, imageAlt);
  await wrapper.scrollIntoViewIfNeeded();
  await wrapper.click();
  await expect(wrapper).toHaveCount(0);
  await expect(readerImage(page, imageAlt)).toHaveClass(/ttu-unspoilered/);
}

function readerSpoilerWrapper(page: Page, imageAlt: string) {
  return readerSpoilerWrappers(page).filter({
    has: page.locator(`img[alt="${imageAlt}"]`)
  });
}

function readerSpoilerWrappers(page: Page) {
  return page.locator('.book-content [data-miwake-spoiler-img]');
}
