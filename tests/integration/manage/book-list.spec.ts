import { expect, type Page, test } from '@playwright/test';
import {
  bookmarkFixturePartway,
  COVER_REFRESH_BOOK,
  expectBookPartwayProgress,
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  PLAIN_TEXT_BOOK,
  VALID_BOOK,
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

test('manager exposes per-book actions without entering selection mode', async ({ page }) => {
  await importBookFixtures(page, [VALID_BOOK]);
  await navigateToManage(page);

  const card = page.locator('article').filter({ hasText: fixtureTitle(VALID_BOOK) });
  await expect(card.getByText('テスト 太郎', { exact: true })).toBeVisible();
  await expect(
    card.getByRole('link', { name: `View statistics for ${fixtureTitle(VALID_BOOK)}` })
  ).toBeVisible();
  await expect(
    card.getByRole('button', { name: `Details for ${fixtureTitle(VALID_BOOK)}` })
  ).toBeVisible();

  await card.getByRole('button', { name: `More actions for ${fixtureTitle(VALID_BOOK)}` }).click();
  await expect(page.getByRole('link', { name: 'Read book' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View statistics', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Book details' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export book backup' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete statistics' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove from library' })).toBeVisible();

  await page.getByRole('button', { name: 'Book details' }).click();
  await expect(page.getByText('Last update', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Last update', { exact: true }).locator('..').locator('dd')
  ).toHaveText(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  await expect(page.getByRole('button', { name: 'Back to book actions' })).toHaveCount(0);
  await card.getByRole('button', { name: `Details for ${fixtureTitle(VALID_BOOK)}` }).click();

  await card.getByRole('button', { name: `More actions for ${fixtureTitle(VALID_BOOK)}` }).click();
  await page.getByRole('button', { name: 'Mark as complete' }).click();
  await expect(card.getByRole('progressbar', { name: /Reading progress/ })).toHaveAttribute(
    'value',
    '100'
  );
  await expect(card.getByText('100%', { exact: true })).toBeVisible();

  await card.getByRole('link', { name: `View statistics for ${fixtureTitle(VALID_BOOK)}` }).click();
  await page.waitForURL((url) => url.pathname === '/statistics' && url.searchParams.has('t'));
});

test('manager confirms before removing a book from the library', async ({ page }) => {
  await importBookFixtures(page, [VALID_BOOK]);
  await navigateToManage(page);

  const title = fixtureTitle(VALID_BOOK);
  const card = page.locator('article').filter({ hasText: title });

  await card.getByRole('button', { name: `More actions for ${title}` }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();

  const dialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Remove book from library?' })
  });
  await expect(dialog).toContainText(`『${title}』`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(card).toBeVisible();

  await card.getByRole('button', { name: `More actions for ${title}` }).click();
  await page.getByRole('button', { name: 'Remove from library' }).click();
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(card).toHaveCount(0);
});

test('selection mode keeps book cards mounted', async ({ page }) => {
  await importBookFixtures(page, [VALID_BOOK]);
  await navigateToManage(page);

  const title = fixtureTitle(VALID_BOOK);
  const card = page.locator('article').filter({ hasText: title });
  const presentation = card.getByRole('progressbar', { name: /Reading progress/ }).locator('..');
  await expect(presentation).toBeVisible();
  await presentation.evaluate((element) => (element.dataset.mountMarker = 'original'));

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(card.getByRole('button', { name: title, exact: true })).toBeVisible();
  await expect(presentation).toHaveAttribute('data-mount-marker', 'original');

  await page.getByRole('button', { name: 'Select', exact: true }).click();
  await expect(card.getByRole('link', { name: title, exact: true })).toBeVisible();
  await expect(presentation).toHaveAttribute('data-mount-marker', 'original');
});

test('selection mode exposes the applicable per-book actions in bulk', async ({ page }) => {
  await importBookFixtures(page, [VALID_BOOK]);
  await navigateToManage(page);

  const title = fixtureTitle(VALID_BOOK);
  const card = page.locator('article').filter({ hasText: title });
  await page.getByRole('button', { name: 'Select' }).click();
  const selectedCount = page.getByTitle(/books? selected/);
  await expect(selectedCount).toHaveText('0');
  const emptySelectionWidth = await selectedCount.evaluate(
    (element) => element.getBoundingClientRect().width
  );
  const selectAllWidth = await page
    .getByRole('button', { name: 'Select All' })
    .evaluate((button) => button.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Select All' }).click();
  await expect(selectedCount).toHaveText('1');
  const populatedSelectionWidth = await selectedCount.evaluate(
    (element) => element.getBoundingClientRect().width
  );
  expect(populatedSelectionWidth).toBe(emptySelectionWidth);
  const clearAllWidth = await page
    .getByRole('button', { name: 'Clear All' })
    .evaluate((button) => button.getBoundingClientRect().width);
  expect(clearAllWidth).toBe(selectAllWidth);
  await page.getByRole('button', { name: 'Clear All' }).click();
  await expect(selectedCount).toHaveText('0');
  await expect(page.getByRole('button', { name: 'Select All' })).toBeVisible();
  await card.getByRole('button', { name: title, exact: true }).click();

  await expect(card.getByRole('button', { name: title, exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  );
  await expect(card.getByRole('link', { name: `View statistics for ${title}` })).toBeVisible();
  await expect(card.getByRole('button', { name: `Details for ${title}` })).toBeVisible();
  await expect(page.getByRole('link', { name: 'View Stats', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Complete', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Export', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Delete Stats', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Read book' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Book details' })).toHaveCount(0);

  const completeWidth = await page
    .getByRole('button', { name: 'Complete', exact: true })
    .evaluate((button) => button.getBoundingClientRect().width);
  await page.getByRole('button', { name: 'Complete', exact: true }).click();
  await expect(card.getByRole('progressbar', { name: /Reading progress/ })).toHaveAttribute(
    'value',
    '100'
  );

  const inProgressWidth = await page
    .getByRole('button', { name: 'In Progress', exact: true })
    .evaluate((button) => button.getBoundingClientRect().width);
  expect(inProgressWidth).toBe(completeWidth);
  await page.getByRole('button', { name: 'In Progress', exact: true }).click();
  await expect(card.getByRole('progressbar', { name: /Reading progress/ })).toHaveAttribute(
    'value',
    '0'
  );

  await page.getByRole('button', { name: 'Delete Stats', exact: true }).click();
  const dialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Delete data' })
  });
  await expect(dialog).toContainText(`『${title}』`);
  await dialog.getByRole('button', { name: 'Cancel' }).click();
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
  const cards = page.locator('article');
  await expect(cards).toHaveCount(fixtures.length);

  for (const [index, fixture] of fixtures.entries()) {
    await expect(cards.nth(index)).toContainText(fixtureTitle(fixture));
  }
}
