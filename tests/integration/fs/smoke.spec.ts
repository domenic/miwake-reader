import { expect, test } from '../helpers/harness.ts';

test('app boots and showDirectoryPicker returns the OPFS seed root', async ({ page }) => {
  await page.goto('/settings');
  await expect(page).toHaveTitle(/Miwake|Reader/i);

  const seedRootName = await page.evaluate(async () => {
    const handle = await window.showDirectoryPicker();
    return handle.name;
  });
  expect(seedRootName).toBe('fake-sync');
});
