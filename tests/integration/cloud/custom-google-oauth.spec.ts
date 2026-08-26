import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';

test('custom Google credentials use the provider default token endpoint', async ({
  context,
  page
}) => {
  const fakeDrive = new FakeGoogleDrive([]);
  await fakeDrive.install(context);

  await navigateToSettingsSync(page);
  const googleDriveSettings = page.locator('[aria-disabled]').filter({
    has: page.getByText('Google Drive', { exact: true })
  });
  await googleDriveSettings.getByRole('button', { name: 'Use custom credentials' }).click();

  const dialog = page.locator('dialog[open]');
  await dialog.getByLabel('Client ID').fill('fake-custom-client.apps.googleusercontent.com');
  await dialog.getByLabel('Client secret').fill('fake-client-secret');
  await dialog.getByRole('button', { name: 'Save and connect' }).click();

  await expect(page.getByText('Connected', { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(page.getByText('Custom OAuth', { exact: true })).toBeVisible();
  expect(fakeDrive.authorizationCodeExchanges).toBe(1);
});
