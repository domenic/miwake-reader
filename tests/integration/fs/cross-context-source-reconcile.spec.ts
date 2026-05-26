import type { Browser, Page, TestInfo } from '@playwright/test';
import { copySyncRoot, expect, newPageInTestContext, test } from '../helpers/harness.ts';
import {
  bookProgressBar,
  deleteBookFromManage,
  expectBooksAbsent,
  expectBooksVisible,
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
  const observer = await connectedObserver(browser, testInfo, page);

  try {
    await importBookFixtures(page, [LONG_BOOK]);
    await waitForSyncIdle(page);
    await copySyncRoot(page, observer.page);
    await forceFullResync(observer.page, 'Sync location wins');
    await page.goto('/manage');
    await observer.page.goto('/manage');
    await expectBooksVisible(observer.page, [VALID_BOOK, LONG_BOOK]);

    await deleteBookFromManage(page, LONG_BOOK);
    await waitForSyncIdle(page);
    await copySyncRoot(page, observer.page);
    await forceFullResync(observer.page, 'Sync location wins');
    await observer.page.goto('/manage');
    await expectBooksAbsent(observer.page, [LONG_BOOK]);
    await expectBooksVisible(observer.page, [VALID_BOOK]);
  } finally {
    await observer.context.close();
  }
});

test('boot reconcile picks up another context adding, completing, and deleting books after reload', async ({
  browser,
  page
}, testInfo) => {
  const observer = await connectedObserver(browser, testInfo, page);

  try {
    await importBookFixtures(page, [LONG_BOOK]);
    await waitForSyncIdle(page);
    await copySyncRoot(page, observer.page);
    await observer.page.reload();
    await waitForSyncIdle(observer.page);
    await observer.page.goto('/manage');
    await expectBooksVisible(observer.page, [VALID_BOOK, LONG_BOOK]);

    await openBookFromManage(page, VALID_BOOK);
    await completeCurrentBook(page);
    await expect(page.getByRole('button', { name: /^(Sync pending|Syncing)/ })).toBeVisible();
    await waitForSyncIdle(page);
    await copySyncRoot(page, observer.page);
    await observer.page.reload();
    await waitForSyncIdle(observer.page);
    await observer.page.goto('/manage');
    await expect(bookProgressBar(observer.page, VALID_BOOK)).toHaveAttribute('value', '100');

    await deleteBookFromManage(page, LONG_BOOK);
    await waitForSyncIdle(page);
    await copySyncRoot(page, observer.page);
    await observer.page.reload();
    await waitForSyncIdle(observer.page);
    await observer.page.goto('/manage');
    await expectBooksAbsent(observer.page, [LONG_BOOK]);
    await expectBooksVisible(observer.page, [VALID_BOOK]);
  } finally {
    await observer.context.close();
  }
});

async function connectedObserver(browser: Browser, testInfo: TestInfo, sourcePage: Page) {
  await importBookFixtures(sourcePage, [VALID_BOOK]);
  await connectFS(sourcePage);

  const observer = await newPageInTestContext(browser, testInfo);
  await observer.page.goto('/');
  await copySyncRoot(sourcePage, observer.page);
  await connectFS(observer.page);
  await observer.page.goto('/manage');
  await expectBooksVisible(observer.page, [VALID_BOOK]);
  return observer;
}
