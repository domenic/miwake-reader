import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  importBookFixtures,
  openStatisticsViewOptions,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { navigateToStatisticsGoals, navigateToStatisticsSummary } from '../helpers/navigation.ts';
import { enableStatistics } from '../helpers/workflows.ts';
import { LATER_STAT_DATE } from './helpers.ts';

test('statistics keyboard shortcuts change the range template and aggregation mode', async ({
  page
}) => {
  await page.clock.install({ time: new Date(`${LATER_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, LATER_STAT_DATE, { durationMs: 61_000 });

  await navigateToStatisticsSummary(page);

  const summary = page.getByRole('region', { name: 'Statistics summary' });
  await expect(page.getByText(`Data for ${LATER_STAT_DATE}`, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(summary.getByText('Book', { exact: true }).first()).toBeVisible();

  await page.keyboard.press('Shift+T');
  await expect(page.getByText(`Data for ${LATER_STAT_DATE}`, { exact: true })).toBeVisible();

  await page.keyboard.down('t');
  await expect(page.getByText('Data for 2026-05-04 - 2026-05-10', { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await page.keyboard.down('t');
  await page.keyboard.up('t');
  await expect(page.getByText('Data for 2026-05-04 - 2026-05-10', { exact: true })).toBeVisible();

  await page.keyboard.press('Shift+A');
  await expect(summary.getByText('Book', { exact: true }).first()).toBeVisible();

  await page.keyboard.down('a');
  await expect(summary.getByText('Book', { exact: true }).first()).toBeHidden();
  await page.keyboard.down('a');
  await page.keyboard.up('a');
  await expect(summary.getByText('Book', { exact: true }).first()).toBeHidden();

  const viewOptions = await openStatisticsViewOptions(page);
  await expect(viewOptions.getByLabel('Template')).toHaveValue('This Week');
  await expect(viewOptions.getByLabel('Primary Aggregration')).toHaveValue('Date');
});

test('statistics keyboard shortcuts do not change hidden view options on Reading Goals', async ({
  page
}) => {
  await page.addInitScript(() => {
    localStorage.setItem('lastStatisticsRangeTemplate', 'This Week');
    localStorage.setItem('lastPrimaryReadingDataAggregationMode', 'Date');
  });
  await navigateToStatisticsGoals(page);

  await page.keyboard.press('t');
  await page.keyboard.press('a');

  await expect
    .poll(() =>
      page.evaluate(() => ({
        range: localStorage.getItem('lastStatisticsRangeTemplate'),
        aggregation: localStorage.getItem('lastPrimaryReadingDataAggregationMode')
      }))
    )
    .toEqual({ range: 'This Week', aggregation: 'Date' });
});
