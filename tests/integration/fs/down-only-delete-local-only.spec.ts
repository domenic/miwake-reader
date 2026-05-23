import {
  clearRemoveEntryLog,
  expect,
  expectSyncRoot,
  listRemoveEntryLog,
  test
} from '../helpers/harness.ts';
import {
  deleteBookFromManage,
  setSyncDirection,
  syncValidBookFixtureToSource,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('deleting a book with "Down only" sync leaves the source copy intact', async ({ page }) => {
  await syncValidBookFixtureToSource(page);

  await setSyncDirection(page, 'Down only');
  await clearRemoveEntryLog(page);
  await deleteBookFromManage(page, VALID_BOOK_TITLE);
  await waitForSyncIdle(page);

  expect(await listRemoveEntryLog(page)).not.toContainEqual({
    directoryName: 'fake-sync',
    name: VALID_BOOK_TITLE,
    recursive: true
  });
  await expectSyncRoot(page, [{ kind: 'directory', name: VALID_BOOK_TITLE }]);
});
