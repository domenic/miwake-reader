import { expect, test } from '../helpers/harness.ts';
import {
  connectFS,
  importValidBookFixture,
  openDisconnectDialog,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('disconnecting without wipe keeps downloaded books on the device', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await waitForSyncIdle(page);

  const dialog = await openDisconnectDialog(page);
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
});
