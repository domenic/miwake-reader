import { expect, expectSyncRoot, removeSyncRootEntry, test } from '../helpers/harness.ts';
import {
  setSyncDirection,
  syncValidBookFixtureToSource,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('boot with "Up only" sync preserves local books missing from the source', async ({ page }) => {
  await syncValidBookFixtureToSource(page);

  await setSyncDirection(page, 'Up only');
  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expectSyncRoot(page, []);

  await page.reload();
  await waitForSyncIdle(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
});
