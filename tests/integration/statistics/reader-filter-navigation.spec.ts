import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  PLAIN_TEXT_BOOK,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { navigateToStatisticsSummary } from '../helpers/navigation.ts';
import { showReaderHeader } from '../helpers/reader.ts';
import { enableStatistics } from '../helpers/workflows.ts';
import {
  expectStatisticsBookFilterCount,
  expectStatisticsView,
  expectSummaryBookHidden,
  expectSummaryBookVisible,
  LATER_STAT_DATE,
  openStatisticsFilter,
  setStatisticsFilterBook
} from './helpers.ts';

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
  await page.getByRole('link', { name: 'Heatmap', exact: true }).click();
  await expectStatisticsView(page, 'heatmap');

  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  const header = await showReaderHeader(page);
  const statisticsLink = header.getByRole('link', { name: 'Statistics', exact: true });
  const bookTitle = fixtureTitle(PLAIN_TEXT_BOOK);
  await expect(statisticsLink).toHaveAttribute(
    'href',
    `/statistics?${new URLSearchParams({ t: bookTitle })}`
  );
  await statisticsLink.click();
  await expect(page).toHaveURL(/\/statistics/);
  await expectStatisticsView(page, 'heatmap');
  await expect
    .poll(() => new URL(page.url()).searchParams.get('t'), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(bookTitle);

  await page.getByRole('link', { name: 'Summary', exact: true }).click();
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
