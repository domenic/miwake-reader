import { stat } from 'node:fs/promises';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  openStatisticsViewOptions,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { navigateToStatisticsSummary } from '../helpers/navigation.ts';
import { enableStatistics } from '../helpers/workflows.ts';
import { EARLIER_STAT_DATE, LATER_STAT_DATE, openStatisticsFilter } from './helpers.ts';

test('statistics header and view options operate on loaded statistics', async ({
  browserName,
  context,
  page
}, testInfo) => {
  const exportPath = testInfo.outputPath('statistics-export.zip');

  // Firefox does not expose these permissions through Playwright; Chromium headless requires them.
  if (browserName === 'chromium') {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  }
  await page.clock.install({ time: new Date(`${EARLIER_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [LONG_BOOK, VALID_BOOK]);
  await recordStatisticForBook(page, LONG_BOOK, EARLIER_STAT_DATE);
  await recordStatisticForBook(page, VALID_BOOK, EARLIER_STAT_DATE, { durationMs: 61_000 });
  await recordStatisticForBook(page, VALID_BOOK, LATER_STAT_DATE, { durationMs: 61_000 });

  await navigateToStatisticsSummary(page);
  await expect(page.getByText(LATER_STAT_DATE, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(page.getByText(EARLIER_STAT_DATE, { exact: true })).toHaveCount(0);

  const filter = await openStatisticsFilter(page);
  await expect(filter.getByText(fixtureTitle(LONG_BOOK), { exact: true })).toBeVisible();

  const selectAll = filter.locator('thead input[type="checkbox"]');
  await filter
    .locator('tbody tr')
    .filter({ hasText: fixtureTitle(LONG_BOOK) })
    .getByRole('checkbox')
    .uncheck();
  await expect(selectAll).toHaveJSProperty('indeterminate', true);

  await filter
    .locator('label')
    .filter({ hasText: 'Only show books with statistics in the target date range' })
    .click();
  await expect(filter.getByText(fixtureTitle(LONG_BOOK), { exact: true })).toHaveCount(0);
  await filter.getByTitle('Close book filter').click();
  await expect(filter).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });

  const viewOptions = await openStatisticsViewOptions(page);
  await expect(
    viewOptions.getByRole('switch', { name: 'Confirm Statistics Deletion' })
  ).toBeChecked();
  await viewOptions.getByLabel('Template').selectOption('This Year');
  await expect(page.getByText(EARLIER_STAT_DATE, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await viewOptions.getByRole('button', { name: 'Set to all time for the selected books' }).click();
  await expect(page.getByText(EARLIER_STAT_DATE, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await viewOptions.getByTitle('Close view options').click();
  await expect(viewOptions).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });

  await page.getByRole('button', { name: /Copy/ }).click();
  await page.getByRole('button', { name: 'Reading Time' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toContain(`.log readtime 2 ${fixtureTitle(VALID_BOOK)}`);

  const exportViewOptions = await openStatisticsViewOptions(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportViewOptions.getByRole('button', { name: 'Export Selection' }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^miwake-reader-export-[\d-]+\.zip$/);
  await download.saveAs(exportPath);
  expect((await stat(exportPath)).size).toBeGreaterThan(0);

  await exportViewOptions.getByRole('button', { name: 'Delete All' }).click();
  const dialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Delete data' })
  });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(/No Data found/)).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
});
