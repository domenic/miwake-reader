import { expect, test } from '../helpers/harness.ts';
import type { Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import {
  expectReaderActionComplete,
  focusReaderShortcutTarget,
  openTOC,
  pressReaderShortcut,
  showReaderHeader
} from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

test('paginated reader returns to a bookmark after page turns', async ({ page }) => {
  await usePaginatedReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const header = await showReaderHeader(page);
  const returnToBookmark = header.getByRole('button', { name: 'Return to Bookmark' });
  await expect(returnToBookmark).toHaveCount(0);

  const initialProgress = await footerTotalProgressText(page);
  await pressReaderShortcut(page, 'Shift+D');
  expect(await footerTotalProgressText(page)).toBe(initialProgress);

  await pressReaderShortcut(page, 'd');
  const bookmarkedProgress = await expectTotalProgressChangedFrom(page, initialProgress);

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

  await pressReaderShortcut(page, 'ArrowRight');
  await expectTotalProgressChangedFrom(page);

  const header = await showReaderHeader(page);
  await expect(header.getByRole('button', { name: 'Return to Bookmark' })).toBeVisible();
});

test('paginated reader keyboard shortcuts turn pages only for plain non-repeated keys', async ({
  page
}) => {
  await usePaginatedReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const initialProgress = await footerTotalProgressText(page);
  await pressReaderShortcut(page, 'Shift+D');
  expect(await footerTotalProgressText(page)).toBe(initialProgress);

  await focusReaderShortcutTarget(page);
  await page.keyboard.down('d');
  const progressAfterD = await expectTotalProgressChangedFrom(page, initialProgress);
  await page.keyboard.down('d');
  await page.keyboard.up('d');
  expect(await footerTotalProgressText(page)).toBe(progressAfterD);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'ArrowLeft');
  await expect.poll(() => footerTotalProgressText(page)).toBe(initialProgress);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'ArrowRight');
  await expect.poll(() => footerTotalProgressText(page)).toBe(progressAfterD);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'PageUp');
  await expect.poll(() => footerTotalProgressText(page)).toBe(initialProgress);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'PageDown');
  await expect.poll(() => footerTotalProgressText(page)).toBe(progressAfterD);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'ArrowUp');
  await expect.poll(() => footerTotalProgressText(page)).toBe(initialProgress);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'ArrowDown');
  await expect.poll(() => footerTotalProgressText(page)).toBe(progressAfterD);
});

test('paginated reader turns pages from either scroll axis', async ({ page }) => {
  await usePaginatedReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const initialProgress = await footerTotalProgressText(page);

  await page.mouse.wheel(0, 100);
  const progressAfterVerticalScroll = await expectTotalProgressChangedFrom(page, initialProgress);
  await expectReaderActionComplete(page);

  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => footerTotalProgressText(page)).toBe(initialProgress);
  await expectReaderActionComplete(page);

  // Paginated wheel input is throttled so one physical gesture does not race through the book.
  await page.waitForTimeout(50);
  await page.mouse.wheel(100, 0);
  await expect.poll(() => footerTotalProgressText(page)).toBe(progressAfterVerticalScroll);
});

test('paginated reader can ignore scrolling without disabling other navigation', async ({
  page
}) => {
  await usePaginatedReader(page, { turnPagesByScrolling: 'Off' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const initialProgress = await footerTotalProgressText(page);
  await page.mouse.wheel(0, 100);
  await page.mouse.wheel(100, 0);
  await page.waitForTimeout(150);
  expect(await footerTotalProgressText(page)).toBe(initialProgress);

  await page.keyboard.press('ArrowRight');
  await expectTotalProgressChangedFrom(page, initialProgress);
});

test('vertical paginated reader maps both scroll axes to reading direction', async ({ page }) => {
  await usePaginatedReader(page, { writingMode: 'Vertical' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const initialProgress = await footerTotalProgressText(page);

  await page.mouse.wheel(-100, 0);
  await expectTotalProgressChangedFrom(page, initialProgress);
  await expectReaderActionComplete(page);

  await page.waitForTimeout(50);
  await page.mouse.wheel(0, -100);
  await expect.poll(() => footerTotalProgressText(page)).toBe(initialProgress);
});

test('vertical paginated reader keyboard shortcuts preserve writing-mode direction', async ({
  page
}) => {
  await usePaginatedReader(page, { writingMode: 'Vertical' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const initialProgress = await footerTotalProgressText(page);

  await pressReaderShortcut(page, 'd');
  expect(await footerTotalProgressText(page)).toBe(initialProgress);

  await pressReaderShortcut(page, 'a');
  const progressAfterA = await expectTotalProgressChangedFrom(page, initialProgress);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'd');
  await expect.poll(() => footerTotalProgressText(page)).toBe(initialProgress);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'ArrowLeft');
  await expect.poll(() => footerTotalProgressText(page)).toBe(progressAfterA);
  await expectReaderActionComplete(page);

  await pressReaderShortcut(page, 'ArrowRight');
  await expect.poll(() => footerTotalProgressText(page)).toBe(initialProgress);
});

test('paginated reader preserves progress after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1_000, height: 700 });
  await usePaginatedReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await pressReaderShortcut(page, 'ArrowRight');
  const progressBeforeResize = await expectTotalProgressChangedFrom(page);

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
  settings: {
    autoBookmark?: string;
    autoBookmarkTime?: string;
    readerMaxWidth?: string;
    turnPagesByScrolling?: string;
    writingMode?: string;
  } = {}
) {
  const { writingMode = 'Horizontal', ...readerSettings } = settings;

  await useReaderSettings(page, {
    ...readerSettings,
    showFooterChapterCharacters: 'On',
    showFooterChapterPercentage: 'On',
    viewMode: 'Paginated',
    writingMode
  });
}

async function expectTotalProgressChangedFrom(page: Page, initialProgress = '0 / 60152 0.00%') {
  await expect.poll(() => footerTotalProgressText(page)).not.toBe(initialProgress);
  return footerTotalProgressText(page);
}

async function footerTotalProgressText(page: Page) {
  return page.locator('#miwake-page-footer span').nth(1).innerText();
}

async function bookContentWidth(page: Page) {
  return page.locator('.book-content').evaluate((el) => el.getBoundingClientRect().width);
}
