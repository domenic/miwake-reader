import { test } from '../helpers/harness.ts';
import { expectBooksInManage, VALID_BOOK } from '../helpers/fixtures.ts';
import { forceFullResync, syncBookFixturesToSource } from '../helpers/workflows.ts';

test('force re-sync "Keep newest" keeps a downloaded book available', async ({ page }) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);
  await forceFullResync(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
});
