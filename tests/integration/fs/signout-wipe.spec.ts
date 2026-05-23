import { expect, test } from '../helpers/harness.ts';
import { importBookFixtures, VALID_BOOK } from '../helpers/fixtures.ts';
import { connectFS, signOutAndWipe, waitForSyncIdle } from '../helpers/workflows.ts';

test('signing out and wiping clears the local library and sync connection', async ({ page }) => {
  await connectFS(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await waitForSyncIdle(page);

  await signOutAndWipe(page);
  await page.goto('/settings/sync');
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
