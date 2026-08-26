import { expect, setDocumentVisibility, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { importBookFixtures, recordStatisticForBook, VALID_BOOK } from '../helpers/fixtures.ts';
import { enableStatistics } from '../helpers/workflows.ts';

const READING_DAY_BOUNDARY = '04:30';

test.use({ timezoneId: 'UTC' });

test('Today reading statistics update when the reader resumes on a new day', async ({ page }) => {
  const statisticDateTime = Temporal.ZonedDateTime.from('2026-05-10T12:00:00+00:00[UTC]');
  const resumedDateTime = statisticDateTime
    .add({ days: 1 })
    .with({ hour: 4, minute: 30, second: 0 });

  await page.clock.install({ time: statisticDateTime.epochMilliseconds });
  await enableStatistics(page);
  const dayBoundaryInput = page.getByLabel('A new reading day starts at');
  await dayBoundaryInput.fill(READING_DAY_BOUNDARY);
  await expect(dayBoundaryInput).toHaveValue(READING_DAY_BOUNDARY);
  await importBookFixtures(page, [VALID_BOOK]);
  await recordStatisticForBook(page, VALID_BOOK, statisticDateTime.toPlainDate().toString(), {
    durationMs: 61_000
  });

  await page.getByRole('button', { name: 'Open reading statistics' }).click();
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today).toContainText(/Reading Time:\s*(?!00:00:00)\d{2}:\d{2}:\d{2}/, {
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await setDocumentVisibility(page, 'hidden');
  await page.clock.setSystemTime(resumedDateTime.epochMilliseconds);
  await setDocumentVisibility(page, 'visible');

  await expect(today).toContainText(/Reading Time:\s*00:00:00/, {
    timeout: SYNC_ASSERTION_TIMEOUT
  });
});
