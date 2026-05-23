import {
  expect,
  forceFullResyncFromSettings,
  listSyncRoot,
  removeSyncRootEntry,
  syncValidBookFixtureToSource,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('force re-sync with "This device wins" restores a local book missing from the source', async ({
  page
}) => {
  await syncValidBookFixtureToSource(page);

  await page.goto('/settings/sync');
  await waitForSyncIdle(page);
  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expect.poll(() => listSyncRoot(page)).toEqual([]);

  await forceFullResyncFromSettings(page, 'This device wins');

  await expect
    .poll(() => listSyncRoot(page), { timeout: 15_000 })
    .toEqual([{ kind: 'directory', name: VALID_BOOK_TITLE }]);
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE, { exact: true })).toBeVisible();
});
