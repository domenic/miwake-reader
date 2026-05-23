import { expect, setDocumentVisibility, test } from '../helpers/harness.ts';
import { importBookFixtures, openBookFromManage, VALID_BOOK } from '../helpers/fixtures.ts';
import { enableStatistics } from '../helpers/workflows.ts';

test('reader tracker button auto-resumes after tab visibility returns', async ({ page }) => {
  await enableStatistics(page);
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Tracker Auto Pause' }) })
    .getByRole('button', { name: 'Moderate', exact: true })
    .click();

  await importBookFixtures(page, [VALID_BOOK]);
  await openBookFromManage(page, VALID_BOOK);

  await page.getByRole('button', { name: 'Resume reading tracker' }).click();
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible();

  await setDocumentVisibility(page, 'hidden');
  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible();

  await setDocumentVisibility(page, 'visible');
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible();
});
