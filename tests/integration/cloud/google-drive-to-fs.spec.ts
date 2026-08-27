import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloud } from '../helpers/cloud.ts';
import {
  expectBooksInManage,
  expectBooksInSyncRoot,
  fixtureTitle,
  importBookFixtures,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import {
  expect,
  pickSyncRootOnNextPicker,
  SYNC_ASSERTION_TIMEOUT,
  test
} from '../helpers/harness.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';
import { waitForSuccessfulSync } from '../helpers/workflows.ts';

const FS_TARGET_ROOT = 'google-drive-switch-target';

test('switching from Google Drive to a sync folder keeps and mirrors the library', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeGoogleDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.GDRIVE);
  await importBookFixtures(page, [VALID_BOOK]);

  const title = fixtureTitle(VALID_BOOK);
  await expect
    .poll(() => fakeDrive.hasBookData(title), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toBe(true);
  await waitForSuccessfulSync(page);
  const googleFileNames = fakeDrive.bookFileNames(title);
  expect(googleFileNames.length).toBeGreaterThan(0);

  await navigateToSettingsSync(page);
  await page.getByRole('button', { name: 'Switch to a sync folder' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Switch to your sync folder?' })).toBeVisible();
  await expect(dialog).toContainText('1 downloaded book syncs up to your sync folder');

  await pickSyncRootOnNextPicker(page, FS_TARGET_ROOT);
  await dialog.getByRole('button', { name: 'Switch to your sync folder' }).click();
  await expect(dialog).toHaveCount(0);
  const syncLocation = page.getByLabel('Sync location');
  await expect(syncLocation.getByText(FS_TARGET_ROOT, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await waitForSuccessfulSync(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
  await expectBooksInSyncRoot(page, [VALID_BOOK], { rootName: FS_TARGET_ROOT });

  await page.reload();
  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
  await navigateToSettingsSync(page);
  await expect(syncLocation.getByText(FS_TARGET_ROOT, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(syncLocation.getByText('Connected', { exact: true })).toBeVisible();
  await waitForSuccessfulSync(page);
  await expectBooksInSyncRoot(page, [VALID_BOOK], { rootName: FS_TARGET_ROOT });

  expect(fakeDrive.hasBook(title)).toBe(true);
  expect(fakeDrive.bookFileNames(title)).toEqual(googleFileNames);
});
