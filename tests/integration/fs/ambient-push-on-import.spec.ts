import {
  connectFS,
  expectSyncRoot,
  importValidBookFixture,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('importing a book while FS sync is connected pushes book data to OPFS', async ({ page }) => {
  await connectFS(page);
  await expectSyncRoot(page, []);

  await importValidBookFixture(page);
  await waitForSyncIdle(page);

  await expectSyncRoot(page, [{ kind: 'directory', name: VALID_BOOK_TITLE }]);
});
