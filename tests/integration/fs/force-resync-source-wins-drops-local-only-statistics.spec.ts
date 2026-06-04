import { test } from '../helpers/harness.ts';
import {
  expectBookStatisticsInSyncRoot,
  expectStatisticsInSummary,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  enableStatistics,
  forceFullResync,
  setSyncDirection,
  syncBookFixturesToSource,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

const SOURCE_STAT_DATE = '2026-04-10';
const LOCAL_ONLY_STAT_DATE = '2026-04-15';

test('force re-sync with "Sync location wins" drops local-only statistics', async ({ page }) => {
  await page.clock.install({ time: new Date(`${SOURCE_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  await recordStatisticForBook(page, VALID_BOOK, SOURCE_STAT_DATE);
  await page.clock.runFor(60_000);
  await waitForSuccessfulSync(page);
  await expectBookStatisticsInSyncRoot(page, VALID_BOOK, [SOURCE_STAT_DATE]);

  await setSyncDirection(page, 'Down only');
  await recordStatisticForBook(page, VALID_BOOK, LOCAL_ONLY_STAT_DATE);
  await expectStatisticsInSummary(page, {
    present: [
      { fixture: VALID_BOOK, dateKey: SOURCE_STAT_DATE },
      { fixture: VALID_BOOK, dateKey: LOCAL_ONLY_STAT_DATE }
    ]
  });

  await forceFullResync(page, 'Sync location wins');

  await expectBookStatisticsInSyncRoot(page, VALID_BOOK, [SOURCE_STAT_DATE]);
  await expectStatisticsInSummary(page, {
    present: [{ fixture: VALID_BOOK, dateKey: SOURCE_STAT_DATE }],
    absent: [{ fixture: VALID_BOOK, dateKey: LOCAL_ONLY_STAT_DATE }]
  });
});
