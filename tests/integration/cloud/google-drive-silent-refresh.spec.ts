import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloud, expectCloudConnected } from '../helpers/cloud.ts';
import {
  COVER_REFRESH_BOOK,
  expectBookCoverLoaded,
  expectBooksInManage
} from '../helpers/fixtures.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';
import { signOutAndWipe } from '../helpers/workflows.ts';

test('reload silently refreshes Google Drive and restores its book listing', async ({
  context,
  page
}) => {
  const fakeDrive = await FakeGoogleDrive.fromBookFixtures(page, [COVER_REFRESH_BOOK]);
  await fakeDrive.install(context);
  await signOutAndWipe(page);

  await connectToCloud(page, SyncEndpointType.GDRIVE);
  await expectBooksInManage(page, { placeholders: [COVER_REFRESH_BOOK], downloaded: [] });
  await expectBookCoverLoaded(page, COVER_REFRESH_BOOK);
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
  expect(fakeDrive.refreshExchanges).toBe(0);

  await page.reload();
  await expect.poll(() => fakeDrive.refreshExchanges, { timeout: SYNC_ASSERTION_TIMEOUT }).toBe(1);
  await expectBooksInManage(page, { placeholders: [COVER_REFRESH_BOOK], downloaded: [] });
  await expectBookCoverLoaded(page, COVER_REFRESH_BOOK);

  await navigateToSettingsSync(page);
  await expectCloudConnected(page, SyncEndpointType.GDRIVE);
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
  expect(fakeDrive.refreshExchanges).toBe(1);
});
