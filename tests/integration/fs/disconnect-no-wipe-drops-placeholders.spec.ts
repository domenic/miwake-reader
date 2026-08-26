import { expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  expectBookPartwayProgress,
  expectBooksInManage,
  LONG_BOOK,
  removeBookProgressFromSyncRoot
} from '../helpers/fixtures.ts';
import {
  connectFS,
  openDisconnectDialog,
  signOutAndWipe,
  syncBookFixturesToSource,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

test('disconnecting without wipe prunes source-only placeholders', async ({ page }) => {
  // Phase 1 — import a real book and let the sync engine upload it to /fake-sync. After this the
  // OPFS layout looks like what a real prior user session would leave behind.
  await syncBookFixturesToSource(page, [LONG_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await waitForSuccessfulSync(page);

  // Phase 2 — wipe local IDB (OPFS files persist across the wipe). The post-reload state is what
  // a fresh second device sees when it points at this same sync folder.
  await signOutAndWipe(page);

  // Phase 3 — reconnect to the same OPFS folder. The sync engine reconciles, finds the existing
  // bookdata zip, and surfaces it as a placeholder card.
  await connectFS(page);
  await expectBooksInManage(page, { placeholders: [LONG_BOOK], downloaded: [] });
  await expectBookPartwayProgress(page, LONG_BOOK);

  // Phase 4 — disconnect without wipe. The placeholder is gone from /manage; no downloaded copy
  // exists locally to keep.
  const leaveDialog = await openDisconnectDialog(page);
  await leaveDialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await expectBooksInManage(page, { placeholders: [], downloaded: [] });
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();

  // Removing source progress before reconnect makes any orphaned local bookmark observable: if
  // disconnect failed to cascade-delete it, the recreated placeholder would keep the stale value.
  await removeBookProgressFromSyncRoot(page, LONG_BOOK);
  await connectFS(page);
  await expectBooksInManage(page, { placeholders: [LONG_BOOK], downloaded: [] });
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', '0');
});
