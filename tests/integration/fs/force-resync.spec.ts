import {
  connectFS,
  expect,
  importValidBookFixture,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('force re-sync keep-newest keeps a downloaded book available', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await waitForSyncIdle(page);

  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Re-sync' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Force full re-sync');
  await dialog.getByRole('button', { name: 'Reconcile' }).click();
  await waitForSyncIdle(page);

  await expect(page.getByText('Sync failed')).toBeHidden();
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
});
