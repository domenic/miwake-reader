import {
  connectFS,
  expect,
  importValidBookFixture,
  openDisconnectDialog,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('disconnecting with "Also wipe my library on this device" clears downloaded books', async ({
  page
}) => {
  await importValidBookFixture(page);
  await connectFS(page);
  await waitForSyncIdle(page);

  const dialog = await openDisconnectDialog(page);
  await expect(dialog.getByText('1 downloaded book stays in your library')).toBeVisible();
  await dialog.getByLabel(/Also wipe my library on this device/).check();
  await dialog.getByRole('button', { name: 'Disconnect and wipe' }).click();

  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE, { exact: true })).toHaveCount(0);
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
