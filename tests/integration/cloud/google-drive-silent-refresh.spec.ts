import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloud, expectCloudConnected } from '../helpers/cloud.ts';
import { expectBooksInManage, VALID_BOOK } from '../helpers/fixtures.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';
import { signOutAndWipe } from '../helpers/workflows.ts';

test('reload silently refreshes Google Drive and restores its book listing', async ({
  context,
  page
}) => {
  const fakeDrive = await FakeGoogleDrive.fromBookFixtures(page, [VALID_BOOK]);
  await fakeDrive.install(context);
  await signOutAndWipe(page);

  await connectToCloud(page, SyncEndpointType.GDRIVE);
  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
  expect(fakeDrive.refreshExchanges).toBe(0);

  await page.reload();
  await expect.poll(() => fakeDrive.refreshExchanges, { timeout: SYNC_ASSERTION_TIMEOUT }).toBe(1);
  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });

  await navigateToSettingsSync(page);
  await expectCloudConnected(page, SyncEndpointType.GDRIVE);
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
});
