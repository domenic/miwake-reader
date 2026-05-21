import {
  connectFS,
  expect,
  importValidBookFixture,
  listSyncRoot,
  removeSyncRootEntry,
  setSyncDirection,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('boot with Up only sync preserves local books missing from the source', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await waitForSyncIdle(page);
  await expect
    .poll(() => listSyncRoot(page))
    .toEqual([{ kind: 'directory', name: VALID_BOOK_TITLE }]);

  await setSyncDirection(page, 'Up only');
  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expect.poll(() => listSyncRoot(page)).toEqual([]);

  await page.reload();
  await waitForSyncIdle(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
});
