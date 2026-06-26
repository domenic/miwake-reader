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

test('statistics summary headers stay sticky while the page scrolls', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 360 });
  await page.clock.install({ time: new Date(`${LATER_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [VALID_BOOK]);

  for (let day = 1; day <= 6; day += 1) {
    await recordStatisticForBook(page, VALID_BOOK, `2026-05-${day.toString().padStart(2, '0')}`);
  }

  await navigateToStatisticsSummary(page);
  const settings = await openStatisticsSettings(page);
  await settings.getByRole('button', { name: 'Set to all time for the selected books' }).click();
  await settings.getByTitle('Close statistics settings').click();
  await expect(settings).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });

  const summary = page.getByRole('region', { name: 'Statistics summary' });
  await expect
    .poll(() => page.evaluate(() => document.scrollingElement!.scrollHeight > window.innerHeight), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(true);
  await expect
    .poll(() => summary.evaluate((el) => el.scrollHeight - el.clientHeight), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBeLessThanOrEqual(1);

  const readingTimeHeader = summary.getByText('Total Time', { exact: true });
  const headerTop = await readingTimeHeader.evaluate((el) =>
    Math.round(el.getBoundingClientRect().top)
  );

  await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));

  await expect
    .poll(() => readingTimeHeader.evaluate((el) => Math.round(el.getBoundingClientRect().top)), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBeLessThan(headerTop);
  await expect
    .poll(() => readingTimeHeader.evaluate((el) => Math.round(el.getBoundingClientRect().top)), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBeGreaterThanOrEqual(48);
  await expect
    .poll(() => readingTimeHeader.evaluate((el) => Math.round(el.getBoundingClientRect().top)), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBeLessThanOrEqual(72);
});
