import {
  connectFS,
  expect,
  forceFullResync,
  importValidBookFixture,
  test,
  VALID_BOOK_TITLE
} from '../helpers/harness.ts';

test('force re-sync "Keep newest" keeps a downloaded book available', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await forceFullResync(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
});
