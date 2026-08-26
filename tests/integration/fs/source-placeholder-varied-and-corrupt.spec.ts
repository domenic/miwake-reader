import { expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  corruptBookDataInSyncRoot,
  expectBookOrder,
  expectBookPartwayProgress,
  expectBooksInManage,
  expectBooksInSyncRoot,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  PLAIN_TEXT_BOOK,
  selectBookSort,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { navigateToManage } from '../helpers/navigation.ts';
import { completeCurrentBook, showReaderHeader } from '../helpers/reader.ts';
import { connectFS, signOutAndWipe } from '../helpers/workflows.ts';

test('fresh-device placeholders preserve varied UI-created progress and surface corrupt source files', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-05-01T12:00:00Z') });
  await importBookFixtures(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);

  await bookmarkFixturePartway(page, LONG_BOOK);
  await expectBooksInManage(page, {
    placeholders: [],
    downloaded: [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]
  });
  await expectBookPartwayProgress(page, LONG_BOOK);

  await page.clock.setSystemTime(new Date('2026-05-02T12:00:00Z'));
  await openBookFromManage(page, VALID_BOOK);
  await completeCurrentBook(page);

  await connectFS(page);
  await expectBooksInSyncRoot(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);

  await signOutAndWipe(page);
  await corruptBookDataInSyncRoot(page, PLAIN_TEXT_BOOK);
  await connectFS(page);

  await expectBooksInManage(page, {
    placeholders: [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK],
    downloaded: []
  });
  await expect(bookProgressBar(page, VALID_BOOK)).toHaveAttribute('value', '100');
  await expectBookPartwayProgress(page, LONG_BOOK);
  await expect(bookProgressBar(page, PLAIN_TEXT_BOOK)).toHaveAttribute('value', '0');
  await selectBookSort(page, 'Last Read', 'descending');
  await expectBookOrder(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);

  await openBookFromManage(page, VALID_BOOK);
  await showReaderHeader(page);
  await expect(page.getByRole('button', { name: 'Undo Complete' })).toBeVisible();
  await navigateToManage(page);

  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Error loading book' })).toBeVisible();
  await expect(dialog).toContainText('Force re-sync');
  await expect(dialog).not.toContainText('Connect its sync location');
  await expect(dialog.getByRole('link', { name: 'Open Issue Tracker' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Download Logs' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Book', exact: true })).toHaveCount(0);
});
