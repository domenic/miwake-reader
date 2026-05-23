import { test } from '../helpers/harness.ts';
import { expectBooksVisible, importBookFixtures, VALID_BOOK } from '../helpers/fixtures.ts';
import { connectFS, forceFullResync } from '../helpers/workflows.ts';

test('force re-sync "Keep newest" keeps a downloaded book available', async ({ page }) => {
  await connectFS(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await forceFullResync(page);

  await page.goto('/manage');
  await expectBooksVisible(page, [VALID_BOOK]);
});
