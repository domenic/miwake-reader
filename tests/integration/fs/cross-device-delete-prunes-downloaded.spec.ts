import { expect, expectSyncRoot, removeSyncRootEntry, test } from '../helpers/harness.ts';
import {
  syncValidBookFixtureToSource,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('boot reconcile prunes a downloaded book deleted from the sync source', async ({ page }) => {
  await syncValidBookFixtureToSource(page);

  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expectSyncRoot(page, []);

  await page.reload();
  await waitForSyncIdle(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE, { exact: true })).toHaveCount(0);
  await expectSyncRoot(page, []);
});
