import { expect, type Page, test } from '@playwright/test';
import {
  bookmarkFixturePartway,
  COVER_REFRESH_BOOK,
  expectBookPartwayProgress,
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  PLAIN_TEXT_BOOK,
  type LibraryBookFixture
} from '../helpers/fixtures.ts';
import { navigateToManage } from '../helpers/navigation.ts';

test('manager derives card progress and sort order from library state', async ({ page }) => {
  await importBookFixtures(page, [COVER_REFRESH_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);

  await navigateToManage(page);
  await expectBookPartwayProgress(page, LONG_BOOK);

  await selectSort(page, 'Title', 'ascending');
  await expectBookOrder(page, [COVER_REFRESH_BOOK, LONG_BOOK, PLAIN_TEXT_BOOK]);

  await selectSort(page, 'Title', 'descending');
  await expectBookOrder(page, [PLAIN_TEXT_BOOK, LONG_BOOK, COVER_REFRESH_BOOK]);

  await page.reload();
  await expectBookOrder(page, [PLAIN_TEXT_BOOK, LONG_BOOK, COVER_REFRESH_BOOK]);
});

async function selectSort(page: Page, label: string, direction: 'ascending' | 'descending') {
  await page.getByRole('button', { name: /Sort/ }).click();
  await page
    .getByRole('button', {
      name: `Sort by ${label} ${direction}`
    })
    .click();
}

async function expectBookOrder(page: Page, fixtures: LibraryBookFixture[]) {
  const cards = page.locator('[role="banner"]');
  await expect(cards).toHaveCount(fixtures.length);

  for (const [index, fixture] of fixtures.entries()) {
    await expect(cards.nth(index)).toContainText(fixtureTitle(fixture));
  }
}
