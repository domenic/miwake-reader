import type { Browser, Page, TestInfo } from '@playwright/test';
import { copySyncRoot, expect, newPageInTestContext, test } from '../helpers/harness.ts';
import { loadApp } from '../helpers/navigation.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  deleteBookFromManage,
  expectBookPartwayProgress,
  expectBooksInManage,
  importBookFixtures,
  type LibraryBookFixture,
  LONG_BOOK,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { completeCurrentBook } from '../helpers/reader.ts';
import { connectFS, waitForSuccessfulSync, waitForSyncIdle } from '../helpers/workflows.ts';

test('boot reconcile picks up another context adding, completing, and deleting books after reload', async ({
  browser,
  page
}, testInfo) => {
  await using observer = await connectedObserver(browser, testInfo, page);

  await importBookFixtures(page, [LONG_BOOK]);
  await waitForSyncIdle(page);
  await copySyncRoot(page, observer.page);
  await observer.page.reload();
  await waitForSyncIdle(observer.page);
  await expectBooksInManage(observer.page, {
    placeholders: [VALID_BOOK, LONG_BOOK],
    downloaded: []
  });

  await openBookFromManage(page, VALID_BOOK);
  await completeCurrentBook(page);
  await expect(page.getByRole('button', { name: /^(Sync pending|Syncing)/ })).toBeVisible();
  await waitForSyncIdle(page);
  await copySyncRoot(page, observer.page);
  await observer.page.reload();
  await waitForSyncIdle(observer.page);
  await expectBooksInManage(observer.page, {
    placeholders: [VALID_BOOK, LONG_BOOK],
    downloaded: []
  });
  await expect(bookProgressBar(observer.page, VALID_BOOK)).toHaveAttribute('value', '100');

  await deleteBookFromManage(page, LONG_BOOK);
  await waitForSyncIdle(page);
  await copySyncRoot(page, observer.page);
  await observer.page.reload();
  await waitForSyncIdle(observer.page);
  await expectBooksInManage(observer.page, { placeholders: [VALID_BOOK], downloaded: [] });
});

test('boot reconcile refreshes downloaded book progress from another context', async ({
  browser,
  page
}, testInfo) => {
  await using observer = await connectedObserver(browser, testInfo, page, [VALID_BOOK, LONG_BOOK]);
  await openBookFromManage(observer.page, LONG_BOOK);
  await waitForSyncIdle(observer.page);
  await openBookFromManage(observer.page, VALID_BOOK);
  await waitForSyncIdle(observer.page);
  await expectBooksInManage(observer.page, {
    placeholders: [],
    downloaded: [VALID_BOOK, LONG_BOOK]
  });

  await bookmarkFixturePartway(page, LONG_BOOK);
  await waitForSuccessfulSync(page);

  await openBookFromManage(page, VALID_BOOK);
  await completeCurrentBook(page);
  await waitForSuccessfulSync(page);

  await copySyncRoot(page, observer.page);
  await observer.page.reload();
  await waitForSyncIdle(observer.page);

  await expectBooksInManage(observer.page, {
    placeholders: [],
    downloaded: [VALID_BOOK, LONG_BOOK]
  });
  await expectBookPartwayProgress(observer.page, LONG_BOOK);
  await expect(bookProgressBar(observer.page, VALID_BOOK)).toHaveAttribute('value', '100');
});

async function connectedObserver(
  browser: Browser,
  testInfo: TestInfo,
  sourcePage: Page,
  fixtures: readonly LibraryBookFixture[] = [VALID_BOOK]
) {
  await importBookFixtures(sourcePage, fixtures);
  await connectFS(sourcePage);

  const observer = await newPageInTestContext(browser, testInfo);
  try {
    await loadApp(observer.page);
    await copySyncRoot(sourcePage, observer.page);
    await connectFS(observer.page);
    await expectBooksInManage(observer.page, { placeholders: fixtures, downloaded: [] });
    return observer;
  } catch (error) {
    await observer[Symbol.asyncDispose]();
    throw error;
  }
}
