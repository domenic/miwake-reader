import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { cloudProviderCard, connectToCloudWithCustomOAuth } from '../helpers/cloud.ts';
import { expect, test } from '../helpers/harness.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';

const CUSTOM_CLIENT_ID = 'fake-custom-client.apps.googleusercontent.com';
const CUSTOM_CLIENT_SECRET = 'fake-client-secret';

test('custom Google credentials use the provider default token endpoint', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeGoogleDrive([], {
    clientIds: [CUSTOM_CLIENT_ID],
    expectedClientSecrets: { [CUSTOM_CLIENT_ID]: CUSTOM_CLIENT_SECRET }
  });
  await fakeDrive.install(context);

  await connectToCloudWithCustomOAuth(page, SyncEndpointType.GDRIVE, {
    clientId: CUSTOM_CLIENT_ID,
    clientSecret: CUSTOM_CLIENT_SECRET
  });
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
});

test('Google authorization validation failures return through the auth redirect', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeGoogleDrive([], { clientIds: ['unexpected-client-id'] });
  await fakeDrive.install(context);
  await navigateToSettingsSync(page);

  await cloudProviderCard(page, SyncEndpointType.GDRIVE)
    .getByRole('button', { name: 'Connect', exact: true })
    .click();

  const errorDialog = page.locator('dialog[open]');
  await expect(
    errorDialog.getByRole('heading', { name: 'Error connecting to Google Drive' })
  ).toBeVisible();
  await expect(errorDialog).toContainText('Authorization failed');
});
