import { clearRemoveEntryLog, test } from '../helpers/harness.ts';
import {
  deleteBookFromManage,
  expectBooksInSyncRoot,
  expectSourceBookRemoveNotLogged,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  setSyncDirection,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('deleting a book with "Down only" sync leaves the source copy intact', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await setSyncDirection(page, 'Down only');
  await clearRemoveEntryLog(page);
  await deleteBookFromManage(page, VALID_BOOK);
  await waitForSyncIdle(page);

  await expectSourceBookRemoveNotLogged(page, VALID_BOOK);
  await expectBooksInSyncRoot(page, [VALID_BOOK]);
});
