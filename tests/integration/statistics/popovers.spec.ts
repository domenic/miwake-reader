import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  importBookFixtures,
  openStatisticsSettings,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { navigateToStatisticsSummary } from '../helpers/navigation.ts';
import { enableStatistics } from '../helpers/workflows.ts';
import { LATER_STAT_DATE } from './helpers.ts';

test.beforeEach(async ({ page }) => {
  await page.clock.install({ time: new Date(`${LATER_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, LATER_STAT_DATE, { durationMs: 61_000 });
  await navigateToStatisticsSummary(page);
});

test('statistics summary popovers open, update their controls, and dismiss natively', async ({
  page
}) => {
  const settings = await openStatisticsSettings(page);
  await settings.getByRole('button', { name: 'About reading-time attributes' }).click();

  const helpPopover = settings.getByTestId('statistics-help').filter({
    hasText: 'Reading Time Attribute which should be used for the Summary Tab'
  });
  await expect(helpPopover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(helpPopover).toBeHidden();

  await settings.getByTitle('Close statistics settings').click();
  await expect(settings).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });

  const summary = page.getByRole('region', { name: 'Statistics summary' });
  await summary.getByRole('button', { name: 'Total Time', exact: true }).click();

  const optionsPopover = page.getByTestId('statistics-summary-options').filter({
    has: page.getByRole('button', { name: 'Average Time', exact: true })
  });
  await expect(optionsPopover).toBeVisible();
  await optionsPopover.getByRole('button', { name: 'Average Time', exact: true }).click();
  await expect(optionsPopover).toBeHidden();
  await expect(summary.getByRole('button', { name: 'Average Time', exact: true })).toBeVisible();

  await summary.getByRole('button', { name: / min$/ }).first().click();
  const detailsPopover = page.getByTestId('statistics-summary-details');
  await expect(detailsPopover).toContainText('Total Time');
  await expect(detailsPopover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detailsPopover).toBeHidden();
});

test('heatmap day details open from keyboard-capable cells and dismiss natively', async ({
  page
}) => {
  await page.getByRole('link', { name: 'Heatmap', exact: true }).click();

  const heatmap = page.getByRole('grid', { name: 'Reading Data for 2026' });
  const dayCell = heatmap.getByRole('cell', { name: new RegExp(`^${LATER_STAT_DATE},`) });
  await expect(dayCell).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
  await dayCell.click();

  const detailsPopover = page.getByTestId('heatmap-details');
  await expect(detailsPopover).toContainText(LATER_STAT_DATE);
  await expect(detailsPopover).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(detailsPopover).toBeHidden();
});
