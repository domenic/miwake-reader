import { copySyncRoot, expect, test } from '../helpers/harness.ts';
import {
  bookProgressBar,
  deleteBookFromManage,
  expectBooksInManage,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { completeCurrentBook } from '../helpers/reader.ts';
import { waitForSyncIdle } from '../helpers/workflows.ts';
import { connectedObserver } from './boot-reconcile-helpers.ts';

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
