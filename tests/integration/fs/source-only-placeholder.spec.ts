import { expect, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  expectBooksInManage,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { connectFS, signOutAndWipe, syncBookFixturesToSource } from '../helpers/workflows.ts';

test('opening a source-only placeholder downloads the book into the reader', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await signOutAndWipe(page);
  await connectFS(page);

  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });

  await openBookFromManage(page, VALID_BOOK);

  await expectBookReaderText(page, VALID_BOOK);
  await expect(
    page.locator('dialog[open]').getByRole('heading', { name: 'Load error' })
  ).toHaveCount(0);
});
