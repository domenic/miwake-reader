import { expect, setDocumentVisibility, test } from '../helpers/harness.ts';
import {
  enableStatistics,
  importValidBookFixture,
  VALID_BOOK_TITLE
} from '../helpers/workflows.ts';

test('reader tracker button auto-resumes after tab visibility returns', async ({ page }) => {
  await enableStatistics(page);
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
