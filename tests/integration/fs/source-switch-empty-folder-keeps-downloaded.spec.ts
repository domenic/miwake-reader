import { expect, pickSyncRootOnNextPicker, test } from '../helpers/harness.ts';
import { expectBooksInManage, expectBooksInSyncRoot, VALID_BOOK } from '../helpers/fixtures.ts';
import { openChangeFolderDialog, syncBookFixturesToSource } from '../helpers/workflows.ts';

const EMPTY_SOURCE_ROOT = 'empty-source-root';

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
