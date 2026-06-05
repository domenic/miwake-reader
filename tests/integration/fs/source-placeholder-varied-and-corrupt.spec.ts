import { expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  corruptBookDataInSyncRoot,
  expectBookPartwayProgress,
  expectBooksInManage,
  expectBooksInSyncRoot,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  PLAIN_TEXT_BOOK,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { navigateToManage } from '../helpers/navigation.ts';
import { completeCurrentBook, connectFS, signOutAndWipe } from '../helpers/workflows.ts';

test('fresh-device placeholders preserve varied UI-created progress and surface corrupt source files', async ({
  page
}) => {
  await importBookFixtures(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);

  await bookmarkFixturePartway(page, LONG_BOOK);
  await expectBooksInManage(page, {
    placeholders: [],
    downloaded: [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]
  });
  await expectBookPartwayProgress(page, LONG_BOOK);

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

  await openBookFromManage(page, VALID_BOOK);
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await expect(page.getByRole('button', { name: 'Undo Complete' })).toBeVisible();
  await navigateToManage(page);

  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Load error' })).toBeVisible();
  await expect(dialog).toContainText('Force re-sync');
  await expect(dialog).not.toContainText('Connect its sync location');
});
