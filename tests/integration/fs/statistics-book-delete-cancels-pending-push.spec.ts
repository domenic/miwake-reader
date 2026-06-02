import { expectSyncRoot, test } from '../helpers/harness.ts';
import {
  deleteBookFromManage,
  expectBooksInManage,
  expectBooksInSyncRoot,
  importBookFixtures,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { connectFS, enableStatistics, waitForSuccessfulSync } from '../helpers/workflows.ts';

const SOURCE_STAT_DATE = '2026-04-10';

test('deleting a book cancels pending statistics pushes', async ({ page }) => {
  await page.clock.install({ time: new Date(`${SOURCE_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await connectFS(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await page.clock.runFor(1_000);
  await expectBooksInSyncRoot(page, [VALID_BOOK]);

  await recordStatisticForBook(page, VALID_BOOK, SOURCE_STAT_DATE);
  await deleteBookFromManage(page, VALID_BOOK);
  await waitForSuccessfulSync(page);

  await page.clock.runFor(60_000);

  await expectBooksInManage(page, { placeholders: [], downloaded: [] });
  await expectSyncRoot(page, []);
});
