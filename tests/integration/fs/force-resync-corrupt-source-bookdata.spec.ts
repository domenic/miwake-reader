import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import {
  corruptBookDataInSyncRoot,
  expectBooksInManage,
  PLAIN_TEXT_BOOK
} from '../helpers/fixtures.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';
import {
  connectFS,
  signOutAndWipe,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('force re-sync surfaces corrupt source book data without dropping the placeholder', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [PLAIN_TEXT_BOOK]);
  await signOutAndWipe(page);
  await corruptBookDataInSyncRoot(page, PLAIN_TEXT_BOOK);
  await connectFS(page);
  await expectBooksInManage(page, { placeholders: [PLAIN_TEXT_BOOK], downloaded: [] });

  await navigateToSettingsSync(page);
  await waitForSyncIdle(page);
  await page.getByRole('button', { name: 'Re-sync' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Force full re-sync');
  await dialog.getByRole('button', { name: 'Reconcile' }).click();
  await expect(dialog).toHaveCount(0);

  const syncLocationSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Sync location' })
  });
  await expect(syncLocationSection.getByText('Sync failed').first()).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await expect(syncLocationSection).toContainText(
    'Error Processing plain-text-book: End of central directory not found'
  );
  await expect(syncLocationSection.getByRole('button', { name: 'Retry' })).toBeVisible();

  await expectBooksInManage(page, { placeholders: [PLAIN_TEXT_BOOK], downloaded: [] });
});
