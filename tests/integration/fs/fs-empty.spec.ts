import { test } from '../helpers/harness.ts';
import { expectBooksInManage } from '../helpers/fixtures.ts';
import { connectFS } from '../helpers/workflows.ts';

test('connecting to an empty sync folder leaves the library empty', async ({ page }) => {
  await connectFS(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [] });
});
