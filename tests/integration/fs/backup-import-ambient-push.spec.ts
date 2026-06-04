import { test } from '../helpers/harness.ts';
import {
  expectBooksInManage,
  expectBooksInSyncRoot,
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
  await expectBooksInSyncRoot(page, []);

  await importBackup(page, backupPath);
  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
  await waitForSyncIdle(page);

  await expectBooksInSyncRoot(page, [VALID_BOOK]);
});
