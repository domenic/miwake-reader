import {
  connectFS,
  expect,
  importValidBookFixture,
  test,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('signing out and wiping clears the local library and sync connection', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await waitForSyncIdle(page);

  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Sign out and wipe' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Sign out and wipe local data?');
  await dialog.getByRole('button', { name: 'Confirm' }).click();

  await page.waitForURL('/');
  await page.goto('/settings/sync');
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
