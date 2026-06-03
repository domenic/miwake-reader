import type { Browser, Page, TestInfo } from '@playwright/test';
import { copySyncRoot, expect, newPageInTestContext, test } from '../helpers/harness.ts';
import { loadApp } from '../helpers/navigation.ts';
import {
  bookProgressBar,
  deleteBookFromManage,
  expectBooksInManage,
  expectBooksInSyncRoot,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  completeCurrentBook,
  connectFS,
  forceFullResync,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('force full re-sync with source wins picks up another context adding and deleting books', async ({
  browser,
  page
}, testInfo) => {
  await using observer = await connectedObserver(browser, testInfo, page);

  await importBookFixtures(page, [LONG_BOOK]);
  await waitForSyncIdle(page);
  await copySyncRoot(page, observer.page);
  await expectBooksInSyncRoot(observer.page, [VALID_BOOK, LONG_BOOK]);
  await forceFullResync(observer.page, 'Sync location wins');
  await expectBooksInManage(observer.page, {
    placeholders: [],
    downloaded: [VALID_BOOK, LONG_BOOK]
  });

  await deleteBookFromManage(page, LONG_BOOK);
  await waitForSyncIdle(page);
  await expectBooksInSyncRoot(page, [VALID_BOOK]);
  await copySyncRoot(page, observer.page);
  await expectBooksInSyncRoot(observer.page, [VALID_BOOK]);
  await forceFullResync(observer.page, 'Sync location wins');
  await expectBooksInManage(observer.page, { placeholders: [], downloaded: [VALID_BOOK] });
});

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

async function connectedObserver(browser: Browser, testInfo: TestInfo, sourcePage: Page) {
  await importBookFixtures(sourcePage, [VALID_BOOK]);
  await connectFS(sourcePage);

  const observer = await newPageInTestContext(browser, testInfo);
  try {
    await loadApp(observer.page);
    await copySyncRoot(sourcePage, observer.page);
    await connectFS(observer.page);
    await expectBooksInManage(observer.page, { placeholders: [VALID_BOOK], downloaded: [] });
    return observer;
  } catch (error) {
    await observer[Symbol.asyncDispose]();
    throw error;
  }
}
