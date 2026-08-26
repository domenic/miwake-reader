import type { Page } from '@playwright/test';
import { expect, test } from './helpers/harness.ts';
import {
  expectBookReaderText,
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  PLAIN_TEXT_BOOK
} from './helpers/fixtures.ts';
import { pressReaderShortcut, showReaderHeader } from './helpers/reader.ts';
import { useReaderSettings } from './helpers/workflows.ts';

test('home route opens the manager when there is no last-opened book', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL('/manage');
});

test('settings entry points and legacy routes open the settings sections', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveURL('/settings/appearance');

  await page.goto('/settings/reader');
  await expect(page).toHaveURL('/settings/appearance');

  await page.goto('/settings/statistics');
  await expect(page).toHaveURL('/settings/tracking');
});

test('home route and Book tab open the last-opened book', async ({ page }) => {
  const bookURL = `/b?${new URLSearchParams({ t: fixtureTitle(PLAIN_TEXT_BOOK) })}`;

  await importBookFixtures(page, [PLAIN_TEXT_BOOK]);
  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);

  await page.goto('/');
  await expect(page).toHaveURL(bookURL);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);

  await page.goto('/settings/appearance');
  await page.getByRole('link', { name: 'Book', exact: true }).click();
  await expect(page).toHaveURL(bookURL);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);
});

test('route-changing controls expose their destinations as links', async ({ page }) => {
  const title = fixtureTitle(PLAIN_TEXT_BOOK);
  const bookURL = `/b?${new URLSearchParams({ t: title })}`;
  const statisticsURL = `/statistics?${new URLSearchParams({ t: title })}`;

  await importBookFixtures(page, [PLAIN_TEXT_BOOK]);

  await expect(page.getByRole('link', { name: 'Statistics', exact: true })).toHaveAttribute(
    'href',
    '/statistics'
  );
  await expect(page.getByRole('link', { name: 'Settings', exact: true })).toHaveAttribute(
    'href',
    '/settings'
  );
  await expect(page.getByRole('link', { name: 'Manager', exact: true })).toHaveAttribute(
    'href',
    '/manage'
  );

  const book = page.getByRole('link', { name: title, exact: true });
  await expect(book).toHaveAttribute('href', bookURL);
  await expect(
    page.getByRole('link', {
      name: `View statistics for ${title}`
    })
  ).toHaveAttribute('href', statisticsURL);

  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);
  await showReaderHeader(page);
  await expect(page.getByRole('link', { name: 'Statistics', exact: true })).toHaveAttribute(
    'href',
    statisticsURL
  );

  await page.goto('/settings/appearance');
  await expect(page.getByRole('link', { name: 'Appearance', exact: true })).toHaveAttribute(
    'href',
    '/settings/appearance'
  );
  await expect(page.getByRole('link', { name: 'Reading', exact: true })).toHaveAttribute(
    'href',
    '/settings/reading'
  );
  await expect(page.getByRole('link', { name: 'Sync', exact: true })).toHaveAttribute(
    'href',
    '/settings/sync'
  );
  await expect(page.getByRole('link', { name: 'Tracking', exact: true })).toHaveAttribute(
    'href',
    '/settings/tracking'
  );

  await page.goto('/statistics?view=summary');
  await expect(page.getByRole('link', { name: 'Summary', exact: true })).toHaveAttribute(
    'href',
    '/statistics?view=summary'
  );
  await expect(page.getByRole('link', { name: 'Heatmap', exact: true })).toHaveAttribute(
    'href',
    '/statistics?view=heatmap'
  );
  await expect(page.getByRole('link', { name: 'Goals', exact: true })).toHaveAttribute(
    'href',
    '/statistics?view=goals'
  );
});

test('header link ripple stays contained after its selected state changes', async ({ page }) => {
  await page.goto('/statistics?view=heatmap');

  const summary = page.getByRole('link', { name: 'Summary', exact: true });
  await summary.click();
  await expect(page).toHaveURL('/statistics?view=summary');

  const rippleSurface = summary.locator(':scope > span[aria-hidden="true"]');
  await expect(rippleSurface).toHaveCount(1);
  expect(await rippleSurface.boundingBox()).toEqual(await summary.boundingBox());
});

test('modified book navigation records the book opened in the new tab', async ({ page }) => {
  const bookURL = `/b?${new URLSearchParams({ t: fixtureTitle(PLAIN_TEXT_BOOK) })}`;

  await importBookFixtures(page, [PLAIN_TEXT_BOOK]);

  const bookLink = page.getByRole('link', {
    name: fixtureTitle(PLAIN_TEXT_BOOK),
    exact: true
  });
  const readerPagePromise = page.context().waitForEvent('page');
  await bookLink.click({ modifiers: ['Control'] });
  const readerPage = await readerPagePromise;

  try {
    await expect(readerPage).toHaveURL(bookURL);
    await expectBookReaderText(readerPage, PLAIN_TEXT_BOOK);
  } finally {
    await readerPage.close();
  }

  await page.goto('/');
  await expect(page).toHaveURL(bookURL);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);
});

test('modified reader navigation opens a new tab without leaving the reader', async ({ page }) => {
  const bookURL = `/b?${new URLSearchParams({ t: fixtureTitle(PLAIN_TEXT_BOOK) })}`;

  await importBookFixtures(page, [PLAIN_TEXT_BOOK]);
  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  await expectBookReaderText(page, PLAIN_TEXT_BOOK);

  const header = await showReaderHeader(page);
  const managerLink = header.getByRole('link', { name: 'Manager', exact: true });
  const managerPagePromise = page.context().waitForEvent('page');
  await managerLink.click({ modifiers: ['Control'] });
  const managerPage = await managerPagePromise;

  try {
    await expect(managerPage).toHaveURL('/manage');
    await expect(page).toHaveURL(bookURL);
    await expectBookReaderText(page, PLAIN_TEXT_BOOK);
  } finally {
    await managerPage.close();
  }
});

test('browser Back honors a canceled reader exit', async ({ page }) => {
  const { bookURL } = await prepareReaderWithUnsavedProgress(page);
  await page.evaluate(() => history.back());
  const dialog = readerExitDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(bookURL);
});

test('exit warning remains available while saving position on exit', async ({ page }) => {
  const { bookURL } = await prepareReaderWithUnsavedProgress(page, 'On');
  await page.evaluate(() => history.back());
  const dialog = readerExitDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(page).toHaveURL(bookURL);
});

test('browser Back discards unsaved reader state and preserves Forward history', async ({
  page
}) => {
  const { bookURL, initialProgress } = await prepareReaderWithUnsavedProgress(page);
  await page.evaluate(() => history.back());
  const dialog = readerExitDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL('/manage');

  await page.goForward();
  await expect(page).toHaveURL(bookURL);
  await expectBookReaderText(page, LONG_BOOK);
  await expect(page.locator('#miwake-page-footer span').nth(1)).toHaveText(initialProgress);
});

async function prepareReaderWithUnsavedProgress(
  page: Page,
  savePositionOnExit: 'Off' | 'On' = 'Off'
) {
  const bookURL = `/b?${new URLSearchParams({ t: fixtureTitle(LONG_BOOK) })}`;

  await useReaderSettings(page, {
    autoBookmark: 'Off',
    closeConfirmation: 'On',
    savePositionOnExit,
    viewMode: 'Paginated',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const progress = page.locator('#miwake-page-footer span').nth(1);
  const initialProgress = await progress.innerText();
  await pressReaderShortcut(page, 'd');
  await expect.poll(() => progress.innerText()).not.toBe(initialProgress);

  return { bookURL, initialProgress };
}

function readerExitDialog(page: Page) {
  return page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Confirm exit' })
  });
}
