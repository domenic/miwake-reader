import {
  expect,
  listSyncRoot,
  removeSyncRootEntry,
  syncValidBookFixtureToSource,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('boot reconcile prunes a downloaded book deleted from the sync source', async ({ page }) => {
  await syncValidBookFixtureToSource(page);

  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expect.poll(() => listSyncRoot(page)).toEqual([]);

  await page.reload();
  await waitForSyncIdle(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE, { exact: true })).toHaveCount(0);
  await expect.poll(() => listSyncRoot(page), { timeout: 5_000 }).toEqual([]);
});
