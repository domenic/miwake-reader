import { expectSyncRoot, test } from '../helpers/harness.ts';
import { expectBooksInManage, removeBooksFromSyncRoot, VALID_BOOK } from '../helpers/fixtures.ts';
import {
  setSyncDirection,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('boot with "Up only" sync preserves local books missing from the source', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await setSyncDirection(page, 'Up only');
  await removeBooksFromSyncRoot(page, [VALID_BOOK]);
  await expectSyncRoot(page, []);

  await page.reload();
  await waitForSyncIdle(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
});
