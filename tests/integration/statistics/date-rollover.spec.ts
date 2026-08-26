import { expect, setDocumentVisibility, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { importBookFixtures, recordStatisticForBook, VALID_BOOK } from '../helpers/fixtures.ts';
import { navigateToStatisticsSummary } from '../helpers/navigation.ts';
import { enableStatistics } from '../helpers/workflows.ts';

const READING_DAY_BOUNDARY = '04:30';

test.use({ timezoneId: 'UTC' });

test('Today statistics update at the reading-day boundary and when the app resumes', async ({
  page
}) => {
  const statisticDateTime = Temporal.ZonedDateTime.from('2026-05-10T12:00:00+00:00[UTC]');
  const beforeBoundaryDateTime = statisticDateTime
    .add({ days: 1 })
    .with({ hour: 4, minute: 29, second: 45 });
  const nextDateTime = beforeBoundaryDateTime.add({ seconds: 30 });
  const resumedDateTime = nextDateTime.add({ days: 1 });
  const statisticDate = statisticDateTime.toPlainDate().toString();
  const nextDate = nextDateTime.toPlainDate().toString();
  const resumedDate = resumedDateTime.toPlainDate().toString();

  await page.clock.install({ time: statisticDateTime.epochMilliseconds });
  await enableStatistics(page);
  const dayBoundaryInput = page.getByLabel('A new reading day starts at');
  await dayBoundaryInput.fill(READING_DAY_BOUNDARY);
  await expect(dayBoundaryInput).toHaveValue(READING_DAY_BOUNDARY);
  await importBookFixtures(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, statisticDate, { durationMs: 61_000 });
  await navigateToStatisticsSummary(page);

  await expect(page.getByText(`Data for ${statisticDate}`, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await page.getByRole('link', { name: 'Heatmap', exact: true }).click();
  const heatmap = page.getByRole('grid', { name: `Reading Data for ${statisticDateTime.year}` });
  const statisticDateCell = heatmap.locator(`[data-date="${statisticDate}"]`);
  const nextDateCell = heatmap.locator(`[data-date="${nextDate}"]`);
  await expect(statisticDateCell).toHaveAttribute('aria-current', 'date', {
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await page.clock.setSystemTime(beforeBoundaryDateTime.epochMilliseconds);
  await page.clock.runFor(30_000);

  await expect(nextDateCell).toHaveAttribute('aria-current', 'date', {
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(statisticDateCell).not.toHaveAttribute('aria-current', 'date');

  await page.getByRole('link', { name: 'Summary', exact: true }).click();

  await expect(page.getByText(`No data for ${nextDate}`, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(page.getByText(`Data for ${statisticDate}`, { exact: true })).toHaveCount(0);

  await setDocumentVisibility(page, 'hidden');
  await page.clock.setSystemTime(resumedDateTime.epochMilliseconds);
  await setDocumentVisibility(page, 'visible');

  await expect(page.getByText(`No data for ${resumedDate}`, { exact: true })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
});
