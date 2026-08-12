import { expect, test } from '../helpers/harness.ts';
import {
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  recordStatisticForBook
} from '../helpers/fixtures.ts';
import { LATER_STAT_DATE } from './helpers.ts';
import { enableStatistics } from '../helpers/workflows.ts';

// Regression test: with a single-book library, a URL prefilter covers every
// book with statistics, so the controller reports "no filter needed". Tab
// switches must still preserve the URL's explicit title filter instead of
// canonicalizing it away.
test('switching tabs keeps the title filter when it covers every book', async ({ page }) => {
  await page.clock.install({ time: new Date(`${LATER_STAT_DATE}T11:59:00Z`) });
  await enableStatistics(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await recordStatisticForBook(page, LONG_BOOK, LATER_STAT_DATE);

  const title = fixtureTitle(LONG_BOOK);
  await page.goto(`/statistics?${new URLSearchParams({ view: 'heatmap', t: title })}`);

  await page.getByRole('button', { name: 'Summary', exact: true }).click();

  await expect(page).toHaveURL(`/statistics?${new URLSearchParams({ view: 'summary', t: title })}`);
});
