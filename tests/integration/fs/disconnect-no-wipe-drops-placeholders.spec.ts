import {
  connectFS,
  expect,
  openDisconnectDialog,
  signOutAndWipe,
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
  await signOutAndWipe(page);

  // Phase 3 — reconnect to the same OPFS folder. The sync engine reconciles, finds the existing
  // bookdata zip, and surfaces it as a placeholder card.
  await connectFS(page);
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();

  // Phase 4 — disconnect without wipe. The placeholder is gone from /manage; no downloaded copy
  // exists locally to keep.
  const leaveDialog = await openDisconnectDialog(page);
  await leaveDialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
