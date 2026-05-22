import {
  connectFS,
  expect,
  importValidBookFixture,
  signOutAndWipe,
  test,
  VALID_BOOK_TITLE,
  waitForSuccessfulSync
} from '../helpers/harness.ts';

test('opening a source-only placeholder downloads the book into the reader', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await waitForSuccessfulSync(page);

  await signOutAndWipe(page);
  await connectFS(page);

  await page.goto('/manage');
  const bookCard = page.locator('[role="banner"]').filter({
    has: page.getByText(VALID_BOOK_TITLE, { exact: true })
  });
  await expect(bookCard).toBeVisible();
  await expect(
    bookCard.getByTitle(
      'Not downloaded yet — click the book to copy it from your local sync folder'
    )
  ).toBeVisible();

  await bookCard.getByText(VALID_BOOK_TITLE, { exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/b' && url.searchParams.has('id'));

  await expect(page.getByText('これはテスト用の第一章の本文です。')).toBeVisible();
  await expect(
    page.locator('dialog[open]').getByRole('heading', { name: 'Load Error' })
  ).toHaveCount(0);
});
