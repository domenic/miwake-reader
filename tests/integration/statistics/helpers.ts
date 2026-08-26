import type { Locator, Page } from '@playwright/test';
import { expect, SYNC_ASSERTION_TIMEOUT } from '../helpers/harness.ts';
import { fixtureDisplayTitle, type LibraryBookFixture } from '../helpers/fixtures.ts';

export const EARLIER_STAT_DATE = '2026-04-10';
export const LATER_STAT_DATE = '2026-05-10';

export async function openStatisticsFilter(page: Page) {
  await page.getByRole('button', { name: 'Filter', exact: true }).click();
  const filter = page.locator('dialog.sidebar-overlay[open]').filter({
    has: page.getByPlaceholder('Filter book list')
  });
  await expect(filter).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
  return filter;
}

export async function setStatisticsFilterBook(
  filter: Locator,
  fixture: LibraryBookFixture,
  checked: boolean
) {
  await filter
    .locator('tr')
    .filter({ hasText: fixtureDisplayTitle(fixture) })
    .getByRole('checkbox')
    .setChecked(checked);
}

export async function expectStatisticsBookFilterCount(page: Page, count: number) {
  await expect
    .poll(() => new URL(page.url()).searchParams.getAll('t').filter((title) => title).length, {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(count);
}

export async function expectStatisticsView(page: Page, view: 'summary' | 'heatmap' | 'goals') {
  await expect
    .poll(() => new URL(page.url()).searchParams.get('view'), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(view);
}

export async function expectSummaryBookVisible(page: Page, fixture: LibraryBookFixture) {
  await expect(page.getByTitle(fixtureDisplayTitle(fixture)).filter({ visible: true })).toBeVisible(
    {
      timeout: SYNC_ASSERTION_TIMEOUT
    }
  );
}

export async function expectSummaryBookHidden(page: Page, fixture: LibraryBookFixture) {
  await expect(page.getByTitle(fixtureDisplayTitle(fixture)).filter({ visible: true })).toHaveCount(
    0
  );
}
