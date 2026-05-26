import { expect, test } from '../helpers/harness.ts';
import {
  bookProgressBar,
  corruptBookDataInSyncRoot,
  expectBooksVisible,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  PLAIN_TEXT_BOOK,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { completeCurrentBook, connectFS, signOutAndWipe } from '../helpers/workflows.ts';

const PARTIAL_PROGRESS_VALUE = /^(?:[1-9]|[1-9]\d)$/;

test('fresh-device placeholders preserve varied UI-created progress and surface corrupt source files', async ({
  page
}) => {
  await importBookFixtures(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);

  await openBookFromManage(page, LONG_BOOK);
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await page.getByRole('button', { name: 'TOC' }).click();
  await page.locator('[title="Go to Chapter 4"]').click();
  await expect
    .poll(async () => {
      const footerText = await page.locator('#miwake-page-footer').innerText();
      return Number(/(\d+) \/ \d+/.exec(footerText)?.[1] ?? 0);
    })
    .toBeGreaterThan(1_000);
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await page.getByRole('button', { name: 'Bookmark' }).click();
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await expect(page.getByRole('button', { name: 'Return to Bookmark' })).toBeVisible();
  await page.goto('/manage');
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', PARTIAL_PROGRESS_VALUE);

  await openBookFromManage(page, VALID_BOOK);
  await completeCurrentBook(page);

  await connectFS(page);

  await signOutAndWipe(page);
  await corruptBookDataInSyncRoot(page, PLAIN_TEXT_BOOK);
  await connectFS(page);

  await page.goto('/manage');
  await expectBooksVisible(page, [VALID_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);
  await expect(bookProgressBar(page, VALID_BOOK)).toHaveAttribute('value', '100');
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', PARTIAL_PROGRESS_VALUE);
  await expect(bookProgressBar(page, PLAIN_TEXT_BOOK)).toHaveAttribute('value', '0');

  await openBookFromManage(page, VALID_BOOK);
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await expect(page.getByRole('button', { name: 'Undo Complete' })).toBeVisible();
  await page.goto('/manage');

  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Load Error' })).toBeVisible();
  await expect(dialog).toContainText('Force re-sync');
  await expect(dialog).not.toContainText('Connect its sync location');
});
