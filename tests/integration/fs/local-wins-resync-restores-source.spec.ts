import { expectSyncRoot, test } from '../helpers/harness.ts';
import {
  expectBooksInManage,
  expectBooksInSyncRoot,
  removeBooksFromSyncRoot,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  forceFullResyncFromSettings,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('force re-sync with "This device wins" restores a local book missing from the source', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await page.goto('/settings/sync');
  await waitForSyncIdle(page);
  await removeBooksFromSyncRoot(page, [VALID_BOOK]);
  await expectSyncRoot(page, []);

  await forceFullResyncFromSettings(page, 'This device wins');

  await expectBooksInSyncRoot(page, [VALID_BOOK]);
  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
});
