import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { cloudProviderCard, connectToCloud, expectCloudConnected } from '../helpers/cloud.ts';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  expectBooksInManage,
  importBookFixtures,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import { signOutAndWipe, waitForSuccessfulSync } from '../helpers/workflows.ts';

test('opening a cloud-only book reconnects expired OAuth before downloading', async ({
  context,
  page
}) => {
  const fakeDrive = await FakeGoogleDrive.fromBookFixtures(page, [VALID_BOOK]);
  await fakeDrive.install(context);
  await signOutAndWipe(page);

  await connectToCloud(page, SyncEndpointType.GDRIVE);
  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);

  // A reload clears the in-memory access token. Rejecting the persisted refresh token makes boot
  // reach the same reauth-required state as a revoked or expired real-provider session.
  fakeDrive.expireRefreshToken();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Sign-in expired' })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  expect(fakeDrive.failedRefreshes).toBeGreaterThan(0);

  await openBookFromManage(page, VALID_BOOK);

  await expectBookReaderText(page, VALID_BOOK);
  expect(fakeDrive.authorizationCodeExchanges).toBe(2);
  await expect(page.getByText(/Force re-sync/)).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Open Issue Tracker' })).toHaveCount(0);
});

test('opening an already-downloaded book stays non-interactive after OAuth expires', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeGoogleDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.GDRIVE);
  await importBookFixtures(page, [VALID_BOOK]);
  await waitForSuccessfulSync(page);
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);

  fakeDrive.expireRefreshToken();
  await page.reload();
  await expect(page.getByRole('link', { name: 'Sign-in expired' })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  expect(fakeDrive.failedRefreshes).toBeGreaterThan(0);

  const unexpectedPopup = context
    .waitForEvent('page', { timeout: 1_000 })
    .then(() => true)
    .catch(() => false);
  await openBookFromManage(page, VALID_BOOK);

  await expectBookReaderText(page, VALID_BOOK);
  expect(await unexpectedPopup).toBe(false);
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
});

test('reconnects Google Drive interactively after a transient refresh failure', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeGoogleDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.GDRIVE);
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);

  fakeDrive.failRefreshes(2);
  await page.reload();
  const googleDriveSettings = cloudProviderCard(page, SyncEndpointType.GDRIVE);
  await expect(googleDriveSettings.getByRole('button', { name: 'Reconnect' })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await googleDriveSettings.getByRole('button', { name: 'Reconnect' }).click();

  await expectCloudConnected(page, SyncEndpointType.GDRIVE);
  expect(fakeDrive.authorizationCodeExchanges).toBe(2);
  expect(fakeDrive.failedRefreshes).toBe(2);
});
