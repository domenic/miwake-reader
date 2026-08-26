import { expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  expectBookPartwayProgress,
  expectBooksInManage,
  expectBooksInSyncRoot,
  importBookFixtures,
  LONG_BOOK
} from '../helpers/fixtures.ts';
import { connectFS, openDisconnectDialog, signOutAndWipe } from '../helpers/workflows.ts';

test('disconnecting without wipe removes placeholders and their copied progress', async ({
  page
}) => {
  // Phase 1 — create progress before connecting so the initial source mirror uploads the book and
  // its progress together, as a real prior user session would.
  await importBookFixtures(page, [LONG_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await connectFS(page);
  await expectBooksInSyncRoot(page, [LONG_BOOK]);

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

  // We remain disconnected from the OPFS sync folder, so this local import cannot read progress
  // from it. Reusing the title verifies that disconnecting deleted the placeholder's copied
  // bookmark: reading data is joined by title, so an orphaned local bookmark would attach here.
  await importBookFixtures(page, [LONG_BOOK]);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', '0');
});
