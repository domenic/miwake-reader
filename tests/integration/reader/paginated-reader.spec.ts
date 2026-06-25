import { expect, test } from '../helpers/harness.ts';
import type { Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { openTOC, showReaderHeader } from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

test('paginated reader returns to a bookmark after page turns', async ({ page }) => {
  await usePaginatedReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const header = await showReaderHeader(page);
  const returnToBookmark = header.getByRole('button', { name: 'Return to Bookmark' });
  await expect(returnToBookmark).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  const bookmarkedProgress = await expectTotalProgressChangedFromStart(page);

  await header.getByRole('button', { name: 'Bookmark' }).click();
  await expect(returnToBookmark).toBeVisible();

  await openTOC(page);
  await page.getByTitle('Go to Chapter 4').click();
  await expect.poll(() => footerTotalProgressText(page)).not.toBe(bookmarkedProgress);

  const updatedHeader = await showReaderHeader(page);
  await updatedHeader.getByRole('button', { name: 'Return to Bookmark' }).click();
  await expect.poll(() => footerTotalProgressText(page)).toBe(bookmarkedProgress);
});

test('paginated reader auto-bookmarks after a user page turn', async ({ page }) => {
  await usePaginatedReader(page, { autoBookmark: 'On', autoBookmarkTime: '1' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expect(page.getByRole('button', { name: 'Return to Bookmark' })).toHaveCount(0);

  await page.keyboard.press('ArrowRight');
  await expectTotalProgressChangedFromStart(page);

  const header = await showReaderHeader(page);
  await expect(header.getByRole('button', { name: 'Return to Bookmark' })).toBeVisible();
});

test('paginated reader preserves progress after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1_000, height: 700 });
  await usePaginatedReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await page.keyboard.press('ArrowRight');
  const progressBeforeResize = await expectTotalProgressChangedFromStart(page);

  await page.setViewportSize({ width: 700, height: 700 });
  await expect.poll(() => footerTotalProgressText(page)).toBe(progressBeforeResize);
});

test('paginated reader applies max width to content', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 700 });
  await usePaginatedReader(page, { readerMaxWidth: '420' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expect.poll(() => bookContentWidth(page)).toBe(420);
});

async function usePaginatedReader(
  page: Page,
  settings: { autoBookmark?: string; autoBookmarkTime?: string; readerMaxWidth?: string } = {}
) {
  await useReaderSettings(page, {
    ...settings,
    showFooterChapterCharacters: 'On',
    showFooterChapterPercentage: 'On',
    viewMode: 'Paginated',
    writingMode: 'Horizontal'
  });
}

async function expectTotalProgressChangedFromStart(page: Page) {
  const initialProgress = '0 / 60152 0.00%';
  await expect.poll(() => footerTotalProgressText(page)).not.toBe(initialProgress);
  return footerTotalProgressText(page);
}

async function footerTotalProgressText(page: Page) {
  return page.locator('#miwake-page-footer span').nth(1).innerText();
}

async function bookContentWidth(page: Page) {
  return page.locator('.book-content').evaluate((el) => el.getBoundingClientRect().width);
}
