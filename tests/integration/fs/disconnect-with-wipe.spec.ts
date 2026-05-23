import { expect, test } from '../helpers/harness.ts';
import { expectBooksAbsent, importBookFixtures, VALID_BOOK } from '../helpers/fixtures.ts';
import { connectFS, openDisconnectDialog, waitForSyncIdle } from '../helpers/workflows.ts';

test('disconnecting with "Also wipe my library on this device" clears downloaded books', async ({
  page
}) => {
  await importBookFixtures(page, [VALID_BOOK]);
  await connectFS(page);
  await waitForSyncIdle(page);

  const dialog = await openDisconnectDialog(page);
  await expect(dialog.getByText('1 downloaded book stays in your library')).toBeVisible();
  await dialog.getByLabel(/Also wipe my library on this device/).check();
  await dialog.getByRole('button', { name: 'Disconnect and wipe' }).click();

  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();
  await page.goto('/manage');
  await expectBooksAbsent(page, [VALID_BOOK]);
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
