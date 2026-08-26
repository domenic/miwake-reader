import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  deleteBookFromManage,
  expectBookPartwayProgress,
  importBookFixtures,
  LONG_BOOK
} from '../helpers/fixtures.ts';
import { navigateToSettingsTracking } from '../helpers/navigation.ts';

// Bookmarks are keyed by canonical title, so with the default
// keep-local-reading-data setting a deleted book's reading position
// re-attaches when the same book is imported again — matching how
// statistics have always behaved.
test('reading position survives delete and re-import', async ({ page }) => {
  await importBookFixtures(page, [LONG_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);

  await deleteBookFromManage(page, LONG_BOOK);
  await importBookFixtures(page, [LONG_BOOK]);

  await expectBookPartwayProgress(page, LONG_BOOK);
});

test('reading position is gone after delete and re-import with keep off', async ({ page }) => {
  await setKeepLocalReadingData(page, false);
  await importBookFixtures(page, [LONG_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);

  await deleteBookFromManage(page, LONG_BOOK);
  await importBookFixtures(page, [LONG_BOOK]);

  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', '0');
});

async function setKeepLocalReadingData(page: Page, enabled: boolean) {
  await navigateToSettingsTracking(page);
  await page
    .getByRole('group', { name: 'After removing a book' })
    .getByLabel(enabled ? 'Keep reading data' : 'Delete reading data', { exact: false })
    .check();
}
