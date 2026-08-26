import { copySyncRoot, expect, newPageInTestContext, test } from '../helpers/harness.ts';
import { loadApp } from '../helpers/navigation.ts';
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
  connectFS,
  forceFullResync,
  syncBookFixturesToSource,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';
import { completeCurrentBook } from '../helpers/reader.ts';

test('force re-sync with "This device wins" overwrites newer source progress', async ({
  browser,
  page
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-05-01T12:00:00Z') });
  await syncBookFixturesToSource(page, [LONG_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await expectBookProgressInSyncRoot(page, LONG_BOOK, { completed: false, percentage: 38 });
  await waitForSuccessfulSync(page);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expectBookPartwayProgress(page, LONG_BOOK);

  await using sourceUpdater = await newPageInTestContext(browser, testInfo);
  await loadApp(sourceUpdater.page);
  await sourceUpdater.page.clock.install({ time: new Date('2026-05-02T12:00:00Z') });
  await copySyncRoot(page, sourceUpdater.page);
  await connectFS(sourceUpdater.page);
  await expectBooksInManage(sourceUpdater.page, { placeholders: [LONG_BOOK], downloaded: [] });

  await openBookFromManage(sourceUpdater.page, LONG_BOOK);
  await completeCurrentBook(sourceUpdater.page);
  await expectBookProgressInSyncRoot(sourceUpdater.page, LONG_BOOK, {
    completed: true,
    percentage: 38
  });
  await waitForSuccessfulSync(sourceUpdater.page);
  await expectBooksInManage(sourceUpdater.page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expect(bookProgressBar(sourceUpdater.page, LONG_BOOK)).toHaveAttribute('value', '100');

  await copySyncRoot(sourceUpdater.page, page);
  await forceFullResync(page, 'This device wins');

  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expectBookPartwayProgress(page, LONG_BOOK);

  await using verifier = await newPageInTestContext(browser, testInfo);
  await loadApp(verifier.page);
  await copySyncRoot(page, verifier.page);
  await connectFS(verifier.page);
  await expectBooksInManage(verifier.page, { placeholders: [LONG_BOOK], downloaded: [] });
  await expectBookPartwayProgress(verifier.page, LONG_BOOK);
});
