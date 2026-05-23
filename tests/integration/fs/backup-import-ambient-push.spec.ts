import { expectSyncRoot, test } from '../helpers/harness.ts';
import {
  expectBooksInSyncRoot,
  expectBooksVisible,
  importBookFixtures,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  connectFS,
  exportBackup,
  importBackup,
  signOutAndWipe,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('restoring a book backup while FS sync is connected pushes book data to OPFS', async ({
  page
}, testInfo) => {
  const backupPath = testInfo.outputPath('book-backup.zip');

  await importBookFixtures(page, [VALID_BOOK]);
  await exportBackup(page, backupPath, { allBooks: true });
  await signOutAndWipe(page);

  await connectFS(page);
  await expectSyncRoot(page, []);

  await importBackup(page, backupPath);
  await page.goto('/manage');
  await expectBooksVisible(page, [VALID_BOOK]);
  await waitForSyncIdle(page);

  await expectBooksInSyncRoot(page, [VALID_BOOK]);
});
