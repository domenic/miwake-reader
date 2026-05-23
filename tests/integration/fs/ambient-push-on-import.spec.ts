import { expectSyncRoot, test } from '../helpers/harness.ts';
import { expectBooksInSyncRoot, importBookFixtures, VALID_BOOK } from '../helpers/fixtures.ts';
import { connectFS, waitForSyncIdle } from '../helpers/workflows.ts';

test('importing a book while FS sync is connected pushes book data to OPFS', async ({ page }) => {
  await connectFS(page);
  await expectSyncRoot(page, []);

  await importBookFixtures(page, [VALID_BOOK]);
  await waitForSyncIdle(page);

  await expectBooksInSyncRoot(page, [VALID_BOOK]);
});
