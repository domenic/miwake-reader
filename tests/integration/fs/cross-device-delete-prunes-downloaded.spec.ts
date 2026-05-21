import {
  connectFS,
  expect,
  importValidBookFixture,
  listSyncRoot,
  removeSyncRootEntry,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('boot reconcile prunes a downloaded book deleted from the sync source', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await waitForSyncIdle(page);
  await expect
    .poll(() => listSyncRoot(page), { timeout: 15_000 })
    .toEqual([{ kind: 'directory', name: VALID_BOOK_TITLE }]);

  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expect.poll(() => listSyncRoot(page)).toEqual([]);

  await page.reload();
  await waitForSyncIdle(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE, { exact: true })).toHaveCount(0);
  await expect.poll(() => listSyncRoot(page), { timeout: 5_000 }).toEqual([]);
});
