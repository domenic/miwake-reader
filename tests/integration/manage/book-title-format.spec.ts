import { expect, test } from '@playwright/test';
import {
  EDITION_TITLE_BOOK,
  fixtureDisplayTitle,
  fixtureTitle,
  importBookFixtures,
  openBookFromManage,
  recordStatisticForBook,
  startImportBookFixtures
} from '../helpers/fixtures.ts';
import {
  navigateToManage,
  navigateToSettingsReader,
  navigateToSettingsSync,
  navigateToStatisticsSummary
} from '../helpers/navigation.ts';
import { enableStatistics } from '../helpers/workflows.ts';
import { openStatisticsFilter } from '../statistics/helpers.ts';

test('uses simplified titles by default without changing book URLs', async ({ page }) => {
  const fullTitle = fixtureTitle(EDITION_TITLE_BOOK);
  const simplifiedTitle = fixtureDisplayTitle(EDITION_TITLE_BOOK);

  await startImportBookFixtures(page, [EDITION_TITLE_BOOK]);
  await expect(page.getByRole('link', { name: simplifiedTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: fullTitle, exact: true })).toHaveCount(0);

  await openBookFromManage(page, EDITION_TITLE_BOOK);
  await expect(page).toHaveTitle(`${simplifiedTitle} | Miwake Reader`);
  expect(new URL(page.url()).searchParams.get('t')).toBe(fullTitle);

  await navigateToSettingsReader(page);
  await page.getByRole('button', { name: 'Full', exact: true }).click();
  await navigateToManage(page);

  await expect(page.getByRole('link', { name: fullTitle, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: simplifiedTitle, exact: true })).toHaveCount(0);
});

test('uses simplified titles in statistics and backup selection', async ({ page }) => {
  const fullTitle = fixtureTitle(EDITION_TITLE_BOOK);
  const simplifiedTitle = fixtureDisplayTitle(EDITION_TITLE_BOOK);
  const statisticDate = '2026-08-08';

  await page.clock.install({ time: new Date(`${statisticDate}T12:00:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [EDITION_TITLE_BOOK]);
  await recordStatisticForBook(page, EDITION_TITLE_BOOK, statisticDate);

  await navigateToStatisticsSummary(page);
  await expect(page.getByTitle(simplifiedTitle).filter({ visible: true })).toBeVisible();
  await expect(page.getByText(fullTitle, { exact: true })).toHaveCount(0);

  const filter = await openStatisticsFilter(page);
  await expect(filter.getByText(simplifiedTitle, { exact: true })).toBeVisible();
  await expect(filter.getByText(fullTitle, { exact: true })).toHaveCount(0);
  await filter.getByTitle('Close book filter').click();

  await navigateToSettingsSync(page);
  await page.getByRole('button', { name: 'Export' }).click();
  const dialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Export backup' })
  });
  await expect(dialog.getByText(simplifiedTitle, { exact: true })).toBeVisible();
  await expect(dialog.getByText(fullTitle, { exact: true })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
});
