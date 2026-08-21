import type { Page } from '@playwright/test';
import { expect, SYNC_ASSERTION_TIMEOUT } from './harness.ts';

export async function showReaderHeader(page: Page) {
  const header = readerHeader(page);

  await expect(header).toHaveAttribute('inert', '', { timeout: SYNC_ASSERTION_TIMEOUT });
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await expect(header).not.toHaveAttribute('inert', '', { timeout: SYNC_ASSERTION_TIMEOUT });

  return header;
}

export async function openTOC(page: Page) {
  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: 'TOC' }).click();
}

function readerHeader(page: Page) {
  return page.locator('[aria-label="Reader controls"][role="toolbar"]');
}

export async function readerIsMounted(page: Page) {
  return (await page.getByRole('button', { name: 'Show reader header' }).count()) > 0;
}

export async function completeCurrentBook(page: Page) {
  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: 'Complete Book' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('button', { name: 'Undo Complete' })).toBeVisible();
}

export function readerImage(page: Page, imageAlt: string) {
  return page.locator(`.book-content img[alt="${imageAlt}"]`);
}

export async function readerImageURL(page: Page, imageAlt: string) {
  const src = await readerImage(page, imageAlt).getAttribute('src');
  if (!src) {
    throw new Error(`Expected reader image "${imageAlt}" to have a src`);
  }
  return src;
}

export function readerSVGImage(page: Page, imageLabel: string) {
  return page.locator(`.book-content svg[aria-label="${imageLabel}"] image`);
}

export async function readerSVGImageURL(page: Page, imageLabel: string) {
  const href = await readerSVGImage(page, imageLabel).evaluate((image) => {
    const imageElement = image as SVGImageElement;
    return (
      imageElement.href.baseVal ||
      imageElement.getAttribute('href') ||
      imageElement.getAttribute('xlink:href')
    );
  });
  if (!href) {
    throw new Error(`Expected reader SVG image "${imageLabel}" to have an href`);
  }
  return href;
}
