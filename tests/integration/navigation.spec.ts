import { expect, test } from './helpers/harness.ts';
import {
  expectBookReaderText,
  fixtureTitle,
  importBookFixtures,
  openBookFromManage,
  PLAIN_TEXT_BOOK
} from './helpers/fixtures.ts';

test('home route opens the manager when there is no last-opened book', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/manage');
});

test('home route and Book tab open the last-opened book', async ({ page }) => {
  const bookURL = `/b?${new URLSearchParams({ t: fixtureTitle(PLAIN_TEXT_BOOK) })}`;

  await importBookFixtures(page, [PLAIN_TEXT_BOOK]);
  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);

  await page.goto('/');
  await expect(page).toHaveURL(bookURL);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);

  await page.goto('/settings/reader');
  await page.getByRole('button', { name: 'Book', exact: true }).click();
  await expect(page).toHaveURL(bookURL);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);
});
