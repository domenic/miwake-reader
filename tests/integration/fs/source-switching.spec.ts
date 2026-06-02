import type { Page } from '@playwright/test';
import {
  denyStoredFSAccessOnNextLoad,
  expect,
  expectSyncRoot,
  failNextSyncRootListing,
  pickSyncRootOnNextPicker,
  test
} from '../helpers/harness.ts';
import {
  expectBooksInManage,
  expectBooksInSyncRoot,
  LONG_BOOK,
  removeBooksFromSyncRoot,
  type LibraryBookFixture,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import {
  connectFS,
  openChangeFolderDialog,
  signOutAndWipe,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

const DEFAULT_SOURCE_ROOT = 'fake-sync';
const NEXT_SOURCE_ROOT = 'next-source-root';
const EMPTY_SOURCE_ROOT = 'empty-source-root';
const FAILING_SOURCE_ROOT = 'failing-source-root';

test('changing sync folders replaces source-only placeholders with the new source listing', async ({
  page
}) => {
  await createSourceRootWithBooks(page, DEFAULT_SOURCE_ROOT, [VALID_BOOK]);
  await createSourceRootWithBooks(page, NEXT_SOURCE_ROOT, [LONG_BOOK]);

  await connectFS(page, { rootName: DEFAULT_SOURCE_ROOT });
  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });

  const dialog = await openChangeFolderDialog(page);
  await expect(dialog).toContainText('1 book that lives only at your sync folder drops');
  await pickSyncRootOnNextPicker(page, NEXT_SOURCE_ROOT);
  await dialog.getByRole('button', { name: 'Switch to your sync folder' }).click();
  await expect(page.getByText(NEXT_SOURCE_ROOT, { exact: true })).toBeVisible();
  await waitForSyncIdle(page);

  await expectBooksInManage(page, { placeholders: [LONG_BOOK], downloaded: [] });
});

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

test('changing to an empty sync folder keeps downloaded books and mirrors them there', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [VALID_BOOK]);

  const dialog = await openChangeFolderDialog(page);
  await expect(dialog).toContainText('1 downloaded book syncs up to your sync folder');
  await pickSyncRootOnNextPicker(page, EMPTY_SOURCE_ROOT);
  await dialog.getByRole('button', { name: 'Switch to your sync folder' }).click();
  await expectBooksInSyncRoot(page, [VALID_BOOK], { rootName: EMPTY_SOURCE_ROOT });

  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
});

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

async function createSourceRootWithBooks(
  page: Page,
  rootName: string,
  fixtures: readonly LibraryBookFixture[]
) {
  await syncBookFixturesToSource(page, fixtures, { rootName });
  await signOutAndWipe(page);
}
