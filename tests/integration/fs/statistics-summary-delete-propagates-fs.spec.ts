import { test } from '../helpers/harness.ts';
import {
  deleteAllStatisticsFromSummary,
  expectBookStatisticsInSyncRoot,
  expectNoStatisticsInSummary,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  enableStatistics,
  syncBookFixturesToSource,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

const SOURCE_STAT_DATE = '2026-04-10';

test('deleting statistics from the summary page pushes the deletion to FS', async ({ page }) => {
  await page.clock.install({ time: new Date(`${SOURCE_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await syncBookFixturesToSource(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, SOURCE_STAT_DATE);
  await page.clock.runFor(60_000);
  await waitForSuccessfulSync(page);
  await expectBookStatisticsInSyncRoot(page, VALID_BOOK, [SOURCE_STAT_DATE]);

  await deleteAllStatisticsFromSummary(page);
  await waitForSuccessfulSync(page);

  await expectNoStatisticsInSummary(page);
  await expectBookStatisticsInSyncRoot(page, VALID_BOOK, []);
});
