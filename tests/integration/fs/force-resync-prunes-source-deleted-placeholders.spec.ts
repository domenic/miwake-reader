import { test } from '../helpers/harness.ts';
import {
  expectBooksInManage,
  expectBooksInSyncRoot,
  LONG_BOOK,
  removeBooksFromSyncRoot,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { navigateToSettingsSync } from '../helpers/navigation.ts';
import {
  connectFS,
  forceFullResyncFromSettings,
  signOutAndWipe,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';

test('force re-sync prunes placeholders deleted from the source without a reload', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [VALID_BOOK, LONG_BOOK]);

  await signOutAndWipe(page);
  await connectFS(page);
  await expectBooksInManage(page, {
    placeholders: [VALID_BOOK, LONG_BOOK],
    downloaded: []
  });

  await navigateToSettingsSync(page);
  await waitForSyncIdle(page);
  await removeBooksFromSyncRoot(page, [LONG_BOOK]);
  await expectBooksInSyncRoot(page, [VALID_BOOK]);

  await forceFullResyncFromSettings(page);

  await expectBooksInManage(page, { placeholders: [], downloaded: [VALID_BOOK] });
});
