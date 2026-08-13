import { clearRemoveEntryLog, expect, test } from '../helpers/harness.ts';
import {
  deleteBookFromManage,
  expectBooksInSyncRoot,
  expectSourceBookRemoveNotLogged,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { setSyncDirection, syncBookFixturesToSource } from '../helpers/workflows.ts';

test('deleting a book with sync "Off" leaves the source copy intact', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await setSyncDirection(page, 'Off');
  await clearRemoveEntryLog(page);
  await deleteBookFromManage(page, VALID_BOOK);
  await expect(page.getByRole('link', { name: 'Sync is off' })).toBeVisible();

  await expectSourceBookRemoveNotLogged(page, VALID_BOOK);
  await expectBooksInSyncRoot(page, [VALID_BOOK]);
});
