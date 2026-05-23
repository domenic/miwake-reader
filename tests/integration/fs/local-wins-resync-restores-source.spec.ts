import { expect, expectSyncRoot, removeSyncRootEntry, test } from '../helpers/harness.ts';
import {
  forceFullResyncFromSettings,
  syncValidBookFixtureToSource,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('force re-sync with "This device wins" restores a local book missing from the source', async ({
  page
}) => {
  await syncValidBookFixtureToSource(page);

  await page.goto('/settings/sync');
  await waitForSyncIdle(page);
  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expectSyncRoot(page, []);

  await forceFullResyncFromSettings(page, 'This device wins');

  await expectSyncRoot(page, [{ kind: 'directory', name: VALID_BOOK_TITLE }]);
  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE, { exact: true })).toBeVisible();
});
