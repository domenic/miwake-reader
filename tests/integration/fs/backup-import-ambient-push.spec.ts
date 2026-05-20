import {
  connectFS,
  expect,
  exportBackup,
  importBackup,
  importValidBookFixture,
  listSyncRoot,
  signOutAndWipe,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('restoring a book backup while FS sync is connected pushes book data to OPFS', async ({
  page
}, testInfo) => {
  const backupPath = testInfo.outputPath('book-backup.zip');

  await importValidBookFixture(page);
  await exportBackup(page, backupPath, { allBooks: true });
  await signOutAndWipe(page);

  await connectFS(page);
  await expect.poll(() => listSyncRoot(page)).toEqual([]);

  await importBackup(page, backupPath);
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
  await waitForSyncIdle(page);

  await expect
    .poll(() => listSyncRoot(page), { timeout: 15_000 })
    .toEqual([{ kind: 'directory', name: VALID_BOOK_TITLE }]);
});
