import { expect, expectSyncRoot, test } from '../helpers/harness.ts';
import {
  connectFS,
  exportBackup,
  importBackup,
  importValidBookFixture,
  signOutAndWipe,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('restoring a book backup while FS sync is connected pushes book data to OPFS', async ({
  page
}, testInfo) => {
  const backupPath = testInfo.outputPath('book-backup.zip');

  await importValidBookFixture(page);
  await exportBackup(page, backupPath, { allBooks: true });
  await signOutAndWipe(page);

  await connectFS(page);
  await expectSyncRoot(page, []);

  await importBackup(page, backupPath);
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
  await waitForSyncIdle(page);

  await expectSyncRoot(page, [{ kind: 'directory', name: VALID_BOOK_TITLE }]);
});
