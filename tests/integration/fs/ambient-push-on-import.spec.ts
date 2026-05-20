import {
  connectFS,
  expect,
  importValidBookFixture,
  listSyncRoot,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('importing a book while FS sync is connected pushes book data to OPFS', async ({ page }) => {
  await connectFS(page);
  await expect.poll(() => listSyncRoot(page)).toEqual([]);

  await importValidBookFixture(page);
  await waitForSyncIdle(page);

  await expect
    .poll(() => listSyncRoot(page), { timeout: 15_000 })
    .toEqual([{ kind: 'directory', name: VALID_BOOK_TITLE }]);
});
