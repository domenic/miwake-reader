import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloudWithCustomOAuth } from '../helpers/cloud.ts';
import { expect, test } from '../helpers/harness.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';

const CUSTOM_CLIENT_ID = 'fake-custom-client.apps.googleusercontent.com';
const CUSTOM_CLIENT_SECRET = 'fake-client-secret';

test('custom Google credentials use the provider default token endpoint', async ({
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
});
