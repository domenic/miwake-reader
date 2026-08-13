import { expect, test } from '../helpers/harness.ts';
import { navigateToManage } from '../helpers/navigation.ts';
import { connectFS, setSyncDirection } from '../helpers/workflows.ts';

test('sync indicator shows a neutral off state and links to sync direction settings', async ({
  page
}) => {
  await connectFS(page);
  await setSyncDirection(page, 'Off');

  await navigateToManage(page);
  await page.getByRole('link', { name: 'Sync is off' }).click();

  await expect(page).toHaveURL('/settings/sync#sync-direction');
  const syncDirection = page.getByRole('group', { name: 'Sync direction' });
  await expect(syncDirection).toBeVisible();
  await expect(syncDirection.getByLabel('Off')).toBeChecked();
});

test('sync indicator reacts to browser online state', async ({ context, page }) => {
  await connectFS(page);
  await navigateToManage(page);

  await expect(page.getByRole('link', { name: /^(Up to date|Synced)/ })).toBeVisible();

  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: "Offline — changes will sync when you're back online" })
  ).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByRole('link', { name: /^(Up to date|Synced)/ })).toBeVisible();
});
