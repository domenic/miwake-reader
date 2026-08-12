import { expect, test } from './helpers/harness.ts';

// Pre-title URLs referenced books by the per-device numeric IDB id. There is
// nothing stable to map those to, so they redirect instead.

test('legacy numeric reader URLs redirect to the manager', async ({ page }) => {
  await page.goto('/b?id=20');

  await expect(page).toHaveURL(/\/manage$/);
});

test('legacy numeric statistics URLs drop the book filter and keep the view', async ({ page }) => {
  await page.goto('/statistics?b=3&view=summary');

  await expect(page).toHaveURL('/statistics?view=summary');
});
