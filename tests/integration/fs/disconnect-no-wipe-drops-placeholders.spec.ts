import {
  connectFS,
  expect,
  syncValidBookFixtureToSource,
  test,
  VALID_BOOK_TITLE
} from '../helpers/harness.ts';

test('disconnecting without wipe prunes source-only placeholders', async ({ page }) => {
  // Phase 1 — import a real book and let the sync engine upload it to /fake-sync. After this the
  // OPFS layout looks like what a real prior user session would leave behind.
  await syncValidBookFixtureToSource(page);

  // Phase 2 — wipe local IDB (OPFS files persist across the wipe). The post-reload state is what
  // a fresh second device sees when it points at this same sync folder.
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Sign out and wipe' }).click();
  const wipeDialog = page.locator('dialog[open]');
  await expect(wipeDialog.getByRole('heading')).toContainText('Sign out and wipe local data?');
  await wipeDialog.getByRole('button', { name: 'Confirm' }).click();
  // wipeAllStorage calls window.location.replace('/') after clearing storage; wait for that reload
  // before driving the next interaction, otherwise the test races the reload.
  await page.waitForURL('/');

  // Phase 3 — reconnect to the same OPFS folder. The sync engine reconciles, finds the existing
  // bookdata zip, and surfaces it as a placeholder card.
  await connectFS(page);
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();

  // Phase 4 — disconnect without wipe. The placeholder is gone from /manage; no downloaded copy
  // exists locally to keep.
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  const leaveDialog = page.locator('dialog[open]');
  await expect(leaveDialog.getByRole('heading')).toContainText('Disconnect your sync folder?');
  await leaveDialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
