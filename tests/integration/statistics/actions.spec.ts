import { stat } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  openStatisticsSettings,
  PLAIN_TEXT_BOOK,
  recordStatisticForBook,
  VALID_BOOK,
  type LibraryBookFixture
} from '../helpers/fixtures.ts';
import { navigateToStatisticsSummary } from '../helpers/navigation.ts';
import { showReaderHeader } from '../helpers/reader.ts';
import { enableStatistics } from '../helpers/workflows.ts';

const EARLIER_STAT_DATE = '2026-04-10';
const LATER_STAT_DATE = '2026-05-10';

test('statistics header and settings actions operate on loaded statistics', async ({
  context,
  page
}, testInfo) => {
  const exportPath = testInfo.outputPath('statistics-export.zip');

  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
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

  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const filter = page.locator('dialog.sidebar-overlay[open]').filter({
    has: page.getByPlaceholder('Filter book list')
  });
  await expect(filter).toBeVisible();
  await expect(filter.getByText(fixtureTitle(LONG_BOOK), { exact: true })).toBeVisible();
  await filter
    .locator('label')
    .filter({ hasText: 'Only show books with statistics in the target date range' })
    .click();
  await expect(filter.getByText(fixtureTitle(LONG_BOOK), { exact: true })).toHaveCount(0);
  await filter.getByTitle('Close book filter').click();
  await expect(filter).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });

  const settings = await openStatisticsSettings(page);
  await settings.getByLabel('Template').selectOption('This Year');
  await expect(page.getByText(EARLIER_STAT_DATE, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await settings.getByRole('button', { name: 'Set to all time for the selected books' }).click();
  await expect(page.getByText(EARLIER_STAT_DATE, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await settings.getByTitle('Close statistics settings').click();
  await expect(settings).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });

  await page.getByRole('button', { name: /Copy/ }).click();
  await page.getByRole('button', { name: 'Reading Time' }).click();
  await expect
    .poll(() => page.evaluate(() => navigator.clipboard.readText()), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toContain(`.log readtime 2 ${fixtureTitle(VALID_BOOK)}`);

  const exportSettings = await openStatisticsSettings(page);
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportSettings.getByRole('button', { name: 'Export Selection' }).click()
  ]);
  expect(download.suggestedFilename()).toMatch(/^miwake-reader-export-[\d-]+\.zip$/);
  await download.saveAs(exportPath);
  expect((await stat(exportPath)).size).toBeGreaterThan(0);

  await exportSettings.getByRole('button', { name: 'Delete All' }).click();
  const dialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Delete data' })
  });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(/No Data found/)).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
});

test('reader statistics navigation preserves the active tab and filters to the current book', async ({
  page
}) => {
  await page.clock.install({ time: new Date(`${LATER_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [LONG_BOOK, PLAIN_TEXT_BOOK, VALID_BOOK]);
  await recordStatisticForBook(page, LONG_BOOK, LATER_STAT_DATE);
  await recordStatisticForBook(page, PLAIN_TEXT_BOOK, LATER_STAT_DATE);
  await recordStatisticForBook(page, VALID_BOOK, LATER_STAT_DATE);

  await navigateToStatisticsSummary(page);
  await page.getByRole('button', { name: 'Heatmap', exact: true }).click();
  await expectStatisticsView(page, 'heatmap');

  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: 'Statistics', exact: true }).click();
  await expect(page).toHaveURL(/\/statistics/);
  await expectStatisticsView(page, 'heatmap');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('b'), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toMatch(/^\d+$/);

  await page.getByRole('button', { name: 'Summary', exact: true }).click();
  await expectStatisticsView(page, 'summary');

  await expectSummaryBookVisible(page, PLAIN_TEXT_BOOK);
  await expectSummaryBookHidden(page, LONG_BOOK);
  await expectSummaryBookHidden(page, VALID_BOOK);

  const filter = await openStatisticsFilter(page);
  await setStatisticsFilterBook(filter, LONG_BOOK, true);
  await expectStatisticsBookFilterCount(page, 2);
  await filter.getByTitle('Close book filter').click();
  await expect(filter).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });

  await expectSummaryBookVisible(page, PLAIN_TEXT_BOOK);
  await expectSummaryBookVisible(page, LONG_BOOK);
  await expectSummaryBookHidden(page, VALID_BOOK);

  await page.reload();
  await expectStatisticsBookFilterCount(page, 2);

  await expectSummaryBookVisible(page, PLAIN_TEXT_BOOK);
  await expectSummaryBookVisible(page, LONG_BOOK);
  await expectSummaryBookHidden(page, VALID_BOOK);
});

async function openStatisticsFilter(page: Page) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const filter = page.locator('dialog.sidebar-overlay[open]').filter({
    has: page.getByPlaceholder('Filter book list')
  });
  await expect(filter).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
  return filter;
}

async function setStatisticsFilterBook(
  filter: Locator,
  fixture: LibraryBookFixture,
  checked: boolean
) {
  await filter
    .locator('tr')
    .filter({ hasText: fixtureTitle(fixture) })
    .getByRole('checkbox')
    .setChecked(checked);
}

async function expectStatisticsBookFilterCount(page: Page, count: number) {
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll('b').length, {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(count);
}

async function expectStatisticsView(page: Page, view: 'summary' | 'heatmap') {
  await expect
    .poll(() => new URL(page.url()).searchParams.get('view'), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(view);
}

async function expectSummaryBookVisible(page: Page, fixture: LibraryBookFixture) {
  await expect(page.getByTitle(fixtureTitle(fixture)).filter({ visible: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}

async function expectSummaryBookHidden(page: Page, fixture: LibraryBookFixture) {
  await expect(page.getByTitle(fixtureTitle(fixture)).filter({ visible: true })).toHaveCount(0);
}
