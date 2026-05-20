import { expect, test } from '../helpers/harness.ts';

test('connecting to an empty sync folder leaves the library empty', async ({ page }) => {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  // Wait for the sync engine to settle — the bottom-left indicator flips from "Syncing…" /
  // "Sync pending…" to "Synced just now" once the initial reconcile drains.
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 15_000 });

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
