import { expectSyncRoot, test } from '../helpers/harness.ts';
import { expectBooksAbsent, removeBooksFromSyncRoot, VALID_BOOK } from '../helpers/fixtures.ts';
import { syncBookFixturesToSource, waitForSyncIdle } from '../helpers/workflows.ts';

test('boot reconcile prunes a downloaded book deleted from the sync source', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await removeBooksFromSyncRoot(page, [VALID_BOOK]);
  await expectSyncRoot(page, []);

  await page.reload();
  await waitForSyncIdle(page);

  await page.goto('/manage');
  await expectBooksAbsent(page, [VALID_BOOK]);
  await expectSyncRoot(page, []);
});
