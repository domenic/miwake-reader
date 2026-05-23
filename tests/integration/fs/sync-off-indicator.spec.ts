import { expect, test } from '../helpers/harness.ts';
import { connectFS, setSyncDirection } from '../helpers/workflows.ts';

test('sync indicator shows a neutral off state and links to sync direction settings', async ({
  page
}) => {
  await connectFS(page);
  await setSyncDirection(page, 'Off');

  await page.goto('/manage');
  await page.getByRole('button', { name: 'Sync is off' }).click();

  await expect(page).toHaveURL('/settings/sync#sync-direction');
  const syncDirection = page.getByRole('group', { name: 'Sync direction' });
  await expect(syncDirection).toBeVisible();
  await expect(syncDirection.getByLabel('Off')).toBeChecked();
});
