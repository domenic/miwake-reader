import { SyncEndpointType } from '$lib/data/storage/storage-types';
import {
  connectToCloud,
  connectToCloudWithCustomOAuth,
  expectCloudConnected
} from '../helpers/cloud.ts';
import { FakeOneDrive } from '../helpers/fake-onedrive.ts';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';

const CUSTOM_CLIENT_ID = '11111111-1111-1111-1111-111111111111';
const CUSTOM_CLIENT_SECRET = 'fake-onedrive-client-secret';
const CUSTOM_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/fake-tenant/oauth2/v2.0/token';

test('persists consecutive OneDrive refresh-token rotations', async ({ context, page }) => {
  const fakeDrive = new FakeOneDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.ONEDRIVE);

  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
  expect(fakeDrive.refreshExchanges).toBe(0);

  await page.reload();
  await expect.poll(() => fakeDrive.refreshExchanges, { timeout: SYNC_ASSERTION_TIMEOUT }).toBe(1);
  await expectCloudConnected(page, SyncEndpointType.ONEDRIVE);

  await page.reload();
  await expect.poll(() => fakeDrive.refreshExchanges, { timeout: SYNC_ASSERTION_TIMEOUT }).toBe(2);
  await expectCloudConnected(page, SyncEndpointType.ONEDRIVE);

  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
  expect(fakeDrive.failedRefreshes).toBe(0);
});

test('custom OneDrive refresh uses its token endpoint and client secret', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeOneDrive([], {
    clientId: CUSTOM_CLIENT_ID,
    clientSecret: CUSTOM_CLIENT_SECRET,
    tokenEndpoint: CUSTOM_TOKEN_ENDPOINT
  });
  await fakeDrive.install(context);
  await connectToCloudWithCustomOAuth(page, SyncEndpointType.ONEDRIVE, {
    clientId: CUSTOM_CLIENT_ID,
    clientSecret: CUSTOM_CLIENT_SECRET,
    tokenEndpoint: CUSTOM_TOKEN_ENDPOINT
  });

  await page.reload();
  await expect.poll(() => fakeDrive.refreshExchanges, { timeout: SYNC_ASSERTION_TIMEOUT }).toBe(1);
  await expectCloudConnected(page, SyncEndpointType.ONEDRIVE, { customOAuth: true });

  const refreshRequests = fakeDrive.tokenRequests.filter(
    (request) => request.grantType === 'refresh_token'
  );
  expect(refreshRequests).toHaveLength(1);
  expect(refreshRequests[0]).toMatchObject({
    clientId: CUSTOM_CLIENT_ID,
    clientSecret: CUSTOM_CLIENT_SECRET,
    tokenEndpoint: CUSTOM_TOKEN_ENDPOINT
  });
});
