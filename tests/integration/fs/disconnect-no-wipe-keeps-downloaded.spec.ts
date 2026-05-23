import { expect, test } from '../helpers/harness.ts';
import { expectBooksVisible, importBookFixtures, VALID_BOOK } from '../helpers/fixtures.ts';
import { connectFS, openDisconnectDialog, waitForSyncIdle } from '../helpers/workflows.ts';

test('disconnecting without wipe keeps downloaded books on the device', async ({ page }) => {
  await connectFS(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await waitForSyncIdle(page);

  const dialog = await openDisconnectDialog(page);
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expectBooksVisible(page, [VALID_BOOK]);
});
