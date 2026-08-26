import {
  bookmarkFixturePartway,
  expectBookOrder,
  expectBooksInManage,
  expectBooksInSyncRoot,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  PLAIN_TEXT_BOOK,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { test } from '../helpers/harness.ts';
import { selectBookSort } from '../helpers/manage.ts';
import { navigateToManage } from '../helpers/navigation.ts';
import { connectFS, signOutAndWipe } from '../helpers/workflows.ts';

test('fresh-device placeholders retain Last Read sorting metadata', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-05-01T12:00:00Z'));
  await importBookFixtures(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);

  await page.clock.setFixedTime(new Date('2026-05-02T12:00:00Z'));
  await openBookFromManage(page, VALID_BOOK);
  await navigateToManage(page);

  await connectFS(page);
  await expectBooksInSyncRoot(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);
  await signOutAndWipe(page);
  await connectFS(page);

  await expectBooksInManage(page, {
    placeholders: [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK],
    downloaded: []
  });

  await selectBookSort(page, 'Last Read', 'ascending');
  await expectBookOrder(page, [PLAIN_TEXT_BOOK, LONG_BOOK, VALID_BOOK]);

  await selectBookSort(page, 'Last Read', 'descending');
  await expectBookOrder(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);

  await page.reload();
  await expectBookOrder(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);
});
