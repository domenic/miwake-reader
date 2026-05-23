import { expect, test } from '../helpers/harness.ts';
import {
  bookCard,
  expectBookReaderText,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { connectFS, signOutAndWipe, syncBookFixturesToSource } from '../helpers/workflows.ts';

test('opening a source-only placeholder downloads the book into the reader', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await signOutAndWipe(page);
  await connectFS(page);

  await page.goto('/manage');
  const book = bookCard(page, VALID_BOOK);
  await expect(book).toBeVisible();
  await expect(
    book.getByTitle('Not downloaded yet — click the book to copy it from your local sync folder')
  ).toBeVisible();

  await openBookFromManage(page, VALID_BOOK);

  await expectBookReaderText(page, VALID_BOOK);
  await expect(
    page.locator('dialog[open]').getByRole('heading', { name: 'Load Error' })
  ).toHaveCount(0);
});
