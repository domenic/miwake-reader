import { expect, test } from '../helpers/harness.ts';
import {
  expectBookStatisticInSyncRoot,
  expectBookStatisticsInSyncRoot,
  expectStatisticsInSummary,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  enableStatistics,
  syncBookFixturesToSource,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

const STAT_DATE = '2026-04-10';
const EDITED_READING_TIME_SECONDS = 2_520;
const EDITED_CHARACTERS_READ = 4_242;

test('editing a statistics row pushes updated values to FS', async ({ page }) => {
  await page.clock.install({ time: new Date(`${STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await syncBookFixturesToSource(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, STAT_DATE);
  await page.clock.runFor(60_000);
  await waitForSuccessfulSync(page);
  await expectBookStatisticsInSyncRoot(page, VALID_BOOK, [STAT_DATE]);

  await expectStatisticsInSummary(page, {
    present: [{ fixture: VALID_BOOK, dateKey: STAT_DATE }]
  });

  const summary = page.getByRole('region', { name: 'Statistics summary' });
  await summary.getByTitle('Edit Row').click();
  const readingTimeInput = summary.getByLabel('Reading time (seconds)');
  const charactersReadInput = summary.getByLabel('Characters read');
  await readingTimeInput.fill(String(EDITED_READING_TIME_SECONDS));
  await charactersReadInput.fill(String(EDITED_CHARACTERS_READ));
  await summary.getByTitle('Save Changes').click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Update data' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(summary.getByText('42 min', { exact: true })).toBeVisible();

  await page.clock.runFor(60_000);
  await waitForSuccessfulSync(page);

  await expectBookStatisticInSyncRoot(page, VALID_BOOK, {
    charactersRead: EDITED_CHARACTERS_READ,
    dateKey: STAT_DATE,
    readingTime: EDITED_READING_TIME_SECONDS
  });
});
