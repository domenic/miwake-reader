import { denyStoredFSAccessOnNextLoad, expect, expectSyncRoot, test } from '../helpers/harness.ts';
import { expectBooksInManage, removeBooksFromSyncRoot, VALID_BOOK } from '../helpers/fixtures.ts';
import { syncBookFixturesToSource, waitForSyncIdle } from '../helpers/workflows.ts';

test('regranting access to the same sync folder still prunes source-deleted books', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);
  await removeBooksFromSyncRoot(page, [VALID_BOOK]);
  await expectSyncRoot(page, []);

  await denyStoredFSAccessOnNextLoad(page);
  await page.reload();
  await expect(page.getByText('Permission required')).toBeVisible();

  await page.getByRole('button', { name: 'Grant access' }).click();
  await waitForSyncIdle(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [] });
  await expectSyncRoot(page, []);
});
