import { expect, test } from '../helpers/harness.ts';
import {
  connectFS,
  forceFullResync,
  importValidBookFixture,
  VALID_BOOK_TITLE
} from '../helpers/workflows.ts';

test('force re-sync "Keep newest" keeps a downloaded book available', async ({ page }) => {
  await connectFS(page);
  await importValidBookFixture(page);
  await forceFullResync(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
});
