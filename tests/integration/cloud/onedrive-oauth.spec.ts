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
const DEFAULT_TOKEN_ENDPOINT = 'https://login.microsoftonline.com/consumers/oauth2/v2.0/token';

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

  const defaultEndpointResponse = await page.evaluate(async (tokenEndpoint) => {
    const response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: new URLSearchParams({
        client_id: 'wrong-client',
        grant_type: 'refresh_token',
        refresh_token: 'wrong-token'
      })
    });
    return { body: await response.json(), status: response.status };
  }, DEFAULT_TOKEN_ENDPOINT);
  expect(defaultEndpointResponse).toEqual({
    body: {
      error: 'invalid_request',
      error_description: 'The default token endpoint was used instead of the configured endpoint.'
    },
    status: 400
  });
});

test('malformed OneDrive JSON requests receive diagnostic responses', async ({ context, page }) => {
  const fakeDrive = new FakeOneDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.ONEDRIVE);

  const statuses = await page.evaluate(async (accessToken) => {
    const urls = [
      'https://graph.microsoft.com/v1.0/$batch',
      'https://graph.microsoft.com/v1.0/me/drive/items/missing/children',
      'https://graph.microsoft.com/v1.0/me/drive/items/missing:/file:/createUploadSession',
      'https://graph.microsoft.com/v1.0/me/drive/items/missing/createUploadSession',
      'https://graph.microsoft.com/v1.0/me/drive/items/missing'
    ];
    return Promise.all(
      urls.map(async (url) => {
        const response = await fetch(url, {
          method: url.endsWith('/missing') ? 'PATCH' : 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: '{'
        });
        return response.status;
      })
    );
  }, fakeDrive.latestAccessToken);

  expect(statuses).toEqual([400, 400, 400, 400, 400]);
});
