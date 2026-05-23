import { expect, test } from '../helpers/harness.ts';
import { connectFS } from '../helpers/workflows.ts';

test('connecting to an empty sync folder leaves the library empty', async ({ page }) => {
  await connectFS(page);

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
});
