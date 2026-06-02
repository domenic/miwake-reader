import { expectSyncRoot, test } from '../helpers/harness.ts';
import { expectBooksInManage, removeBooksFromSyncRoot, VALID_BOOK } from '../helpers/fixtures.ts';
import { syncBookFixturesToSource, waitForSyncIdle } from '../helpers/workflows.ts';

test('boot reconcile prunes a downloaded book deleted from the sync source', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await removeBooksFromSyncRoot(page, [VALID_BOOK]);
  await expectSyncRoot(page, []);

  await page.reload();
  await waitForSyncIdle(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [] });
  await expectSyncRoot(page, []);
});
