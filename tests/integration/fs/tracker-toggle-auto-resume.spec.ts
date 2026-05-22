import {
  expect,
  importValidBookFixture,
  setDocumentVisibility,
  test,
  VALID_BOOK_TITLE
} from '../helpers/harness.ts';

test('reader tracker button auto-resumes after tab visibility returns', async ({ page }) => {
  await page.goto('/settings/statistics');
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Enable Statistics' }) })
    .getByRole('button', { name: 'On', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeVisible();
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Tracker Auto Pause' }) })
    .getByRole('button', { name: 'Moderate', exact: true })
    .click();

  await importValidBookFixture(page);
  await page.getByText(VALID_BOOK_TITLE, { exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/b' && url.searchParams.has('id'));

  await page.getByRole('button', { name: 'Resume reading tracker' }).click();
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible();

  await setDocumentVisibility(page, 'hidden');
  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible();

  await setDocumentVisibility(page, 'visible');
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible();
});
