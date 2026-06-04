import { expect, pickSyncRootOnNextPicker, test } from '../helpers/harness.ts';
import { expectBooksInManage, LONG_BOOK, VALID_BOOK } from '../helpers/fixtures.ts';
import {
  connectFS,
  openChangeFolderDialog,
  signOutAndWipe,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

const DEFAULT_SOURCE_ROOT = 'fake-sync';
const NEXT_SOURCE_ROOT = 'next-source-root';

test('changing sync folders replaces source-only placeholders with the new source listing', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [VALID_BOOK], { rootName: DEFAULT_SOURCE_ROOT });
  await signOutAndWipe(page);
  await syncBookFixturesToSource(page, [LONG_BOOK], { rootName: NEXT_SOURCE_ROOT });
  await signOutAndWipe(page);

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
