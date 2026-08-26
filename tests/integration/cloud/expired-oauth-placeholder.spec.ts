import type { Page } from '@playwright/test';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  expectBooksInManage,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';
import { signOutAndWipe } from '../helpers/workflows.ts';

test('opening a cloud-only book reconnects expired OAuth before downloading', async ({
  context,
  page
}) => {
  const fakeDrive = await FakeGoogleDrive.fromBookFixtures(page, [VALID_BOOK]);
  await fakeDrive.install(context);
  await signOutAndWipe(page);

  await connectToDefaultFakeGoogleDrive(page);
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

async function connectToDefaultFakeGoogleDrive(page: Page) {
  await navigateToSettingsSync(page);
  const googleDriveSettings = page.locator('[aria-disabled]').filter({
    has: page.getByText('Google Drive', { exact: true })
  });
  await googleDriveSettings.getByRole('button', { name: 'Connect', exact: true }).click();

  await expect(page.getByText('Connected', { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}
