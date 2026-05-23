import {
  clearRemoveEntryLog,
  deleteBookFromManage,
  expect,
  listRemoveEntryLog,
  listSyncRoot,
  setSyncDirection,
  syncValidBookFixtureToSource,
  test,
  VALID_BOOK_TITLE
} from '../helpers/harness.ts';

test('deleting a book with sync "Off" leaves the source copy intact', async ({ page }) => {
  await syncValidBookFixtureToSource(page);

  await setSyncDirection(page, 'Off');
  await clearRemoveEntryLog(page);
  await deleteBookFromManage(page, VALID_BOOK_TITLE);
  await expect(page.getByRole('button', { name: 'Sync is off' })).toBeVisible();

  expect(await listRemoveEntryLog(page)).not.toContainEqual({
    directoryName: 'fake-sync',
    name: VALID_BOOK_TITLE,
    recursive: true
  });
  await expect
    .poll(() => listSyncRoot(page), { timeout: 5_000 })
    .toEqual([{ kind: 'directory', name: VALID_BOOK_TITLE }]);
});
