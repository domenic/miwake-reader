import { test } from '../helpers/harness.ts';
import {
  expectStatisticsInSummary,
  importBookFixtures,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  enableStatistics,
  exportBackup,
  importBackup,
  signOutAndWipe
} from '../helpers/workflows.ts';

const SOURCE_STAT_DATE = '2026-04-10';
const LOCAL_ONLY_STAT_DATE = '2026-04-15';

test('backup import with "ZIP wins" drops local-only statistics for the imported book', async ({
  page
}, testInfo) => {
  const backupPath = testInfo.outputPath('statistics-backup.zip');

  await page.clock.install({ time: new Date(`${SOURCE_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, SOURCE_STAT_DATE);
  await exportBackup(page, backupPath, { allBooks: true, allStatistics: true });

  await signOutAndWipe(page);
  await enableStatistics(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, SOURCE_STAT_DATE);
  await recordStatisticForBook(page, VALID_BOOK, LOCAL_ONLY_STAT_DATE);
  await expectStatisticsInSummary(page, {
    present: [
      { fixture: VALID_BOOK, dateKey: SOURCE_STAT_DATE },
      { fixture: VALID_BOOK, dateKey: LOCAL_ONLY_STAT_DATE }
    ]
  });

  await importBackup(page, backupPath, { direction: 'ZIP wins' });

  await expectStatisticsInSummary(page, {
    present: [{ fixture: VALID_BOOK, dateKey: SOURCE_STAT_DATE }],
    absent: [{ fixture: VALID_BOOK, dateKey: LOCAL_ONLY_STAT_DATE }]
  });
});
