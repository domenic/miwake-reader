import { expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  expectBookPartwayProgress,
  expectBookProgressInSyncRoot,
  expectBooksInManage,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import {
  forceFullResync,
  setSyncDirection,
  syncBookFixturesToSource,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';
import { completeCurrentBook } from '../helpers/reader.ts';

test('force re-sync with "Sync location wins" overwrites newer local progress', async ({
  page
}) => {
  await page.clock.install({ time: new Date('2026-05-01T12:00:00Z') });
  await syncBookFixturesToSource(page, [LONG_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await expectBookProgressInSyncRoot(page, LONG_BOOK, { completed: false, percentage: 38 });
  await waitForSuccessfulSync(page);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expectBookPartwayProgress(page, LONG_BOOK);

  await setSyncDirection(page, 'Down only');
  await page.clock.setSystemTime(new Date('2026-05-02T12:00:00Z'));
  await openBookFromManage(page, LONG_BOOK);
  await completeCurrentBook(page);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', '100');

  await forceFullResync(page, 'Sync location wins');

  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expectBookPartwayProgress(page, LONG_BOOK);
});
