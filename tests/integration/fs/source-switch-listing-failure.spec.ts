import {
  expect,
  failNextSyncRootListing,
  pickSyncRootOnNextPicker,
  test
} from '../helpers/harness.ts';
import { expectBooksInManage, VALID_BOOK } from '../helpers/fixtures.ts';
import {
  connectFS,
  openChangeFolderDialog,
  signOutAndWipe,
  syncBookFixturesToSource
} from '../helpers/workflows.ts';

const FAILING_SOURCE_ROOT = 'failing-source-root';

test('failed sync folder switch leaves the current source and library state intact', async ({
  page
}) => {
  const listingFailureMessage = 'Simulated listing failure';

  await syncBookFixturesToSource(page, [VALID_BOOK]);
  await signOutAndWipe(page);
  await connectFS(page);
  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });

  const dialog = await openChangeFolderDialog(page);
  await pickSyncRootOnNextPicker(page, FAILING_SOURCE_ROOT);
  await failNextSyncRootListing(page, listingFailureMessage);
  await dialog.getByRole('button', { name: 'Switch to your sync folder' }).click();

  const errorDialog = page.locator('dialog[open]');
  await expect(
    errorDialog.getByRole('heading', { name: "Couldn't connect to your sync folder" })
  ).toBeVisible();
  await expect(errorDialog).toContainText(listingFailureMessage);
  await errorDialog.getByRole('button', { name: 'OK' }).click();

  await expect(page.getByText('Connected')).toBeVisible();
  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });
});
