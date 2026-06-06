import { expect, test } from '../helpers/harness.ts';
import {
  corruptBookDataInSyncRoot,
  expectBooksInManage,
  expectBooksInSyncRoot,
  openBookFromManage,
  PLAIN_TEXT_BOOK,
  removeBooksFromSyncRoot
} from '../helpers/fixtures.ts';
import {
  connectFS,
  signOutAndWipe,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('boot prune clears the last-opened pointer for a deleted placeholder', async ({ page }) => {
  await syncBookFixturesToSource(page, [PLAIN_TEXT_BOOK]);
  await signOutAndWipe(page);
  await corruptBookDataInSyncRoot(page, PLAIN_TEXT_BOOK);
  await connectFS(page);
  await expectBooksInManage(page, { placeholders: [PLAIN_TEXT_BOOK], downloaded: [] });

  await openBookFromManage(page, PLAIN_TEXT_BOOK);
  const loadErrorDialog = page.locator('dialog[open]');
  await expect(loadErrorDialog.getByRole('heading', { name: 'Error loading book' })).toBeVisible();
  await expect(loadErrorDialog).toContainText('Force re-sync');
  await expect(loadErrorDialog.getByRole('link', { name: 'Open Issue Tracker' })).toBeVisible();
  await expect(loadErrorDialog.getByRole('link', { name: 'Download Logs' })).toBeVisible();
  await loadErrorDialog.getByRole('button', { name: 'Close' }).click();

  await removeBooksFromSyncRoot(page, [PLAIN_TEXT_BOOK]);
  await expectBooksInSyncRoot(page, []);

  await page.reload();
  await waitForSyncIdle(page);
  await expectBooksInManage(page, { placeholders: [], downloaded: [] });

  await page.goto('/');
  await expect(page).toHaveURL('/manage');
});
