import type { Browser, Page, TestInfo } from '@playwright/test';
import { copySyncRoot, newPageInTestContext, test } from '../helpers/harness.ts';
import { loadApp } from '../helpers/navigation.ts';
import {
  deleteBookFromManage,
  expectBooksInManage,
  expectBooksInSyncRoot,
  importBookFixtures,
  LONG_BOOK,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { connectFS, forceFullResync, waitForSyncIdle } from '../helpers/workflows.ts';

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
