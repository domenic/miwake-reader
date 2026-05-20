import {
  connectFS,
  expect,
  importValidBookFixture,
  signOutAndWipe,
  test,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('signing out and wiping clears the local library and sync connection', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await waitForSyncIdle(page);

  await signOutAndWipe(page);
  await page.goto('/settings/sync');
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
