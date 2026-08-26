import { copySyncRoot, expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  expectBookPartwayProgress,
  expectBookProgressInSyncRoot,
  expectBooksInManage,
  LONG_BOOK,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { completeCurrentBook } from '../helpers/reader.ts';
import { waitForSuccessfulSync, waitForSyncIdle } from '../helpers/workflows.ts';
import { connectedObserver } from './boot-reconcile-helpers.ts';

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
  await expectBookProgressInSyncRoot(page, LONG_BOOK, { completed: false, percentage: 38 });
  await waitForSuccessfulSync(page);

  await openBookFromManage(page, VALID_BOOK);
  await completeCurrentBook(page);
  await expectBookProgressInSyncRoot(page, VALID_BOOK, { completed: true, percentage: 0 });
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
