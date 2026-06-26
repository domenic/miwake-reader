import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { importBookFixtures, recordStatisticForBook, VALID_BOOK } from '../helpers/fixtures.ts';
import { navigateToStatisticsSummary } from '../helpers/navigation.ts';
import { enableStatistics } from '../helpers/workflows.ts';
import { LATER_STAT_DATE } from './helpers.ts';

test('statistics heatmap expands day cells to fill desktop width', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install({ time: new Date(`${LATER_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, LATER_STAT_DATE);

  await navigateToStatisticsSummary(page);
  await page.getByRole('button', { name: 'Heatmap', exact: true }).click();

  const heatmap = page.getByRole('grid', { name: 'Reading Data for 2026' });
  const dayCell = heatmap.getByRole('cell', { name: new RegExp(`^${LATER_STAT_DATE},`) });
  await expect(dayCell).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });

  const { actualWidth, expectedWidth } = await dayCell.evaluate((el) => {
    const heatmapGrid = el.closest('[role="grid"]');
    if (!(heatmapGrid instanceof HTMLElement) || !heatmapGrid.parentElement) {
      throw new Error('Could not find heatmap container');
    }

    const containerWidth = heatmapGrid.parentElement.clientWidth;
    const arrowElementsWidth = 30;
    const gridGap = 2;
    const gridColumnsPerYear = 54;
    const gridColumnsWidth = gridColumnsPerYear * gridGap;
    const dayGridColumns = 3;
    const allGridColumns = gridColumnsPerYear + dayGridColumns;

    return {
      actualWidth: el instanceof HTMLElement ? el.offsetWidth : el.getBoundingClientRect().width,
      expectedWidth: Math.max(
        15,
        (containerWidth - arrowElementsWidth - gridColumnsWidth) / allGridColumns
      )
    };
  });

  expect(actualWidth).toBeGreaterThanOrEqual(expectedWidth - 1);
});
