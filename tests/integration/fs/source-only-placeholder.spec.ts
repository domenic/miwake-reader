import { expect, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  expectBooksInManage,
  fixtureTitle,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { connectFS, signOutAndWipe, syncBookFixturesToSource } from '../helpers/workflows.ts';

test('download action hydrates a source-only placeholder without opening the reader', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await signOutAndWipe(page);
  await connectFS(page);

  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByText(fixtureTitle(VALID_BOOK), { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Select' }).click();
  await page.getByRole('button', { name: `Download ${fixtureTitle(VALID_BOOK)}` }).click();

  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
  await expect(page.getByText('テスト 太郎', { exact: true })).toBeVisible();
  await expect(page).toHaveURL('/manage');
});

test('opening a source-only placeholder downloads the book into the reader', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await signOutAndWipe(page);
  await connectFS(page);

  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });

  await openBookFromManage(page, VALID_BOOK);

  await expectBookReaderText(page, VALID_BOOK);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
});
