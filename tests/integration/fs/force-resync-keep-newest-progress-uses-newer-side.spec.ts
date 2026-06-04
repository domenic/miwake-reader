import type { Browser, Page, TestInfo } from '@playwright/test';
import { copySyncRoot, expect, newPageInTestContext, test } from '../helpers/harness.ts';
import { loadApp } from '../helpers/navigation.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  expectBookPartwayProgress,
  expectBooksInManage,
  LONG_BOOK,
  openBookFromManage,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  completeCurrentBook,
  connectFS,
  forceFullResync,
  setSyncDirection,
  syncBookFixturesToSource,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

test('force re-sync with "Keep newest" uses the newer progress from either side', async ({
  browser,
  page
}, testInfo) => {
  await page.clock.install({ time: new Date('2026-05-01T12:00:00Z') });
  await syncBookFixturesToSource(page, [LONG_BOOK, VALID_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await waitForSuccessfulSync(page);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK, VALID_BOOK] });
  await expectBookPartwayProgress(page, LONG_BOOK);

  await using sourceUpdater = await connectedSourceUpdater(browser, testInfo, page);
  await sourceUpdater.page.clock.install({ time: new Date('2026-05-02T12:00:00Z') });
  await openBookFromManage(sourceUpdater.page, VALID_BOOK);
  await completeCurrentBook(sourceUpdater.page);
  await waitForSuccessfulSync(sourceUpdater.page);
  await copySyncRoot(sourceUpdater.page, page);

  await setSyncDirection(page, 'Down only');
  await page.clock.setSystemTime(new Date('2026-05-03T12:00:00Z'));
  await openBookFromManage(page, LONG_BOOK);
  await completeCurrentBook(page);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK, VALID_BOOK] });
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', '100');
  await expect(bookProgressBar(page, VALID_BOOK)).toHaveAttribute('value', '0');

  await forceFullResync(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK, VALID_BOOK] });
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', '100');
  await expect(bookProgressBar(page, VALID_BOOK)).toHaveAttribute('value', '100');

  await using verifier = await connectedSourceUpdater(browser, testInfo, page);
  await expectBooksInManage(verifier.page, {
    placeholders: [LONG_BOOK, VALID_BOOK],
    downloaded: []
  });
  await expect(bookProgressBar(verifier.page, LONG_BOOK)).toHaveAttribute('value', '100');
  await expect(bookProgressBar(verifier.page, VALID_BOOK)).toHaveAttribute('value', '100');
});

async function connectedSourceUpdater(browser: Browser, testInfo: TestInfo, sourcePage: Page) {
  const context = await newPageInTestContext(browser, testInfo);
  try {
    await loadApp(context.page);
    await copySyncRoot(sourcePage, context.page);
    await connectFS(context.page);
    return context;
  } catch (error) {
    await context[Symbol.asyncDispose]();
    throw error;
  }
}
