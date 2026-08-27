import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { cloudProviderCard, connectToCloudWithCustomOAuth } from '../helpers/cloud.ts';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';

const CUSTOM_CLIENT_ID = 'fake-custom-client.apps.googleusercontent.com';
const CUSTOM_CLIENT_SECRET = 'fake-client-secret';

test('reconnecting Google Drive preserves default OAuth mode when custom credentials are stored', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeGoogleDrive([], {
    expectedClientSecrets: { [CUSTOM_CLIENT_ID]: CUSTOM_CLIENT_SECRET }
  });
  await fakeDrive.install(context);

  await connectToCloudWithCustomOAuth(page, SyncEndpointType.GDRIVE, {
    clientId: CUSTOM_CLIENT_ID,
    clientSecret: CUSTOM_CLIENT_SECRET
  });
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);

  const googleDriveSettings = cloudProviderCard(page, SyncEndpointType.GDRIVE);
  await googleDriveSettings.getByRole('button', { name: 'Manage credentials' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Use default OAuth app' }).click();

  await expect(googleDriveSettings.getByText('Custom OAuth', { exact: true })).toHaveCount(0, {
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(googleDriveSettings.getByText(/Using .*default OAuth app\./)).toBeVisible();
  expect(fakeDrive.authorizationCodeExchanges).toBe(2);

  // Reverting changes only the active connection. The saved custom credentials remain available,
  // recreating the state in which Reconnect previously inferred the wrong OAuth mode.
  await googleDriveSettings.getByRole('button', { name: 'Use custom credentials' }).click();
  const storedCredentialsDialog = page.locator('dialog[open]');
  await expect(storedCredentialsDialog.getByLabel('Client ID')).toHaveValue(CUSTOM_CLIENT_ID);
  await expect(storedCredentialsDialog.getByLabel('Client secret')).toHaveValue(
    CUSTOM_CLIENT_SECRET
  );
  await storedCredentialsDialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(storedCredentialsDialog).toHaveCount(0);

  fakeDrive.expireRefreshToken();
  await page.reload();
  await expect(googleDriveSettings.getByRole('button', { name: 'Reconnect' })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await googleDriveSettings.getByRole('button', { name: 'Reconnect' }).click();

  await expect(googleDriveSettings.getByText('Connected', { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(googleDriveSettings.getByText('Custom OAuth', { exact: true })).toHaveCount(0);
  await expect(googleDriveSettings.getByText(/Using .*default OAuth app\./)).toBeVisible();
  expect(fakeDrive.authorizationCodeExchanges).toBe(3);
});
