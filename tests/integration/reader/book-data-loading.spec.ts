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
const SPOILER_ONE_DUPLICATE_ALT = 'Spoiler illustration one duplicate';
const SPOILER_TWO_ALT = 'Spoiler illustration two';
const REMOVED_PLACEHOLDER_TEXT = 'Legacy placeholder should be removed.';

test('book data loading formats reader images and keeps spoiler gallery state in sync', async ({
  page
}) => {
  await useReaderSettings(page, { viewMode: 'Continuous', blurImages: 'After ToC' });
  await importBookFixtures(page, [SPOILER_IMAGE_GALLERY_BOOK]);
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);
  await expectBookReaderText(page, SPOILER_IMAGE_GALLERY_BOOK);

  await expect(page.locator('.book-content .placeholder-br')).toHaveCount(0);
  await expect(page.getByText(REMOVED_PLACEHOLDER_TEXT)).toHaveCount(0);
  await expect(readerSpoilerWrappers(page)).toHaveCount(3);
  await expect(readerSpoilerWrapper(page, COVER_ALT)).toHaveCount(0);
  await expect(readerSpoilerWrapper(page, INLINE_ALT)).toHaveCount(0);
  await expect(readerSpoilerWrapper(page, SPOILER_ONE_ALT)).toHaveCount(1);
  await expect(readerSpoilerWrapper(page, SPOILER_ONE_DUPLICATE_ALT)).toHaveCount(1);
  await expect(readerSpoilerWrapper(page, SPOILER_TWO_ALT)).toHaveCount(1);
  await expect(page.locator('.book-content .ttu-img-container')).toHaveCount(6);
  await expect(page.locator('.book-content .ttu-illustration-container')).toHaveCount(5);

  await openImageGallery(page);

  const coverURL = await readerImageURL(page, COVER_ALT);
  const svgURL = await readerSVGImageURL(page, SVG_LABEL);
  const inlineURL = await readerImageURL(page, INLINE_ALT);
  const spoilerOneURL = await readerImageURL(page, SPOILER_ONE_ALT);
  const spoilerOneDuplicateURL = await readerImageURL(page, SPOILER_ONE_DUPLICATE_ALT);
  const spoilerTwoURL = await readerImageURL(page, SPOILER_TWO_ALT);
  const galleryImageURLs = await page
    .getByRole('img', { name: /^Gallery image \d+$/ })
    .evaluateAll((imgs) => imgs.map((img) => (img as HTMLImageElement).src));

  for (const imageURL of [
    coverURL,
    svgURL,
    inlineURL,
    spoilerOneURL,
    spoilerOneDuplicateURL,
    spoilerTwoURL
  ]) {
    expect(imageURL).toMatch(/^blob:/);
  }
  expect(spoilerOneDuplicateURL).toBe(spoilerOneURL);
  expect(galleryImageURLs).toEqual([coverURL, svgURL, spoilerOneURL, spoilerTwoURL]);
  expect(galleryImageURLs).not.toContain(inlineURL);

  await expect(page.getByText('1 / 4')).toBeVisible();
  await page.keyboard.press('Shift+PageDown');
  await expect(page.getByText('1 / 4')).toBeVisible();

  await page.keyboard.down('PageDown');
  await expect(page.getByText('2 / 4')).toBeVisible();
  await page.keyboard.down('PageDown');
  await page.keyboard.up('PageDown');
  await expect(page.getByText('3 / 4')).toBeVisible();
  await page.keyboard.press('PageUp');
  await expect(page.getByText('2 / 4')).toBeVisible();

  await page.keyboard.press('b');
  await page.keyboard.press('Escape');
  const headerAfterGallery = await showReaderHeader(page);
  await expect(headerAfterGallery.getByRole('button', { name: 'Return to Bookmark' })).toHaveCount(
    0
  );
  await headerAfterGallery.getByRole('button', { name: 'Images' }).click();
  await expect(page.getByTitle('Close image gallery')).toBeVisible();

  await expect(page.getByRole('button', { name: 'Reveal gallery image 1' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reveal gallery image 2' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reveal gallery image 3' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reveal gallery image 4' })).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(page.getByTitle('Close image gallery')).toHaveCount(0);
  await revealReaderImage(page, SPOILER_ONE_ALT);
  await openImageGallery(page);

  await expect(page.getByRole('button', { name: 'Reveal gallery image 3' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reveal gallery image 4' })).toBeVisible();

  await page.getByRole('button', { name: 'Reveal gallery image 4' }).click();
  await expect(page.getByRole('button', { name: 'Reveal gallery image 4' })).toHaveCount(0);

  await closeImageGallery(page);
  await expect(readerSpoilerWrapper(page, SPOILER_TWO_ALT)).toHaveCount(1);
});

test('reader images are sharp by default and can all be blurred from one setting', async ({
  page
}) => {
  await useReaderSettings(page, { viewMode: 'Continuous' });
  await importBookFixtures(page, [SPOILER_IMAGE_GALLERY_BOOK]);
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);
  await expectBookReaderText(page, SPOILER_IMAGE_GALLERY_BOOK);

  await expect(readerSpoilerWrappers(page)).toHaveCount(0);

  await useReaderSettings(page, { blurImages: 'All' });
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);
  await expectBookReaderText(page, SPOILER_IMAGE_GALLERY_BOOK);

  await expect(readerSpoilerWrappers(page)).toHaveCount(5);
  await expect(readerSpoilerWrapper(page, COVER_ALT)).toHaveCount(1);
  await expect(readerSpoilerWrapper(page, INLINE_ALT)).toHaveCount(0);
  await expect(readerSpoilerWrapper(page, SPOILER_ONE_ALT)).toHaveCount(1);
});

test('reader route returns to the manager when the book is missing', async ({ page }) => {
  await page.goto('/b?t=no-such-book');

  await expect(page).toHaveURL(/\/manage$/);
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
