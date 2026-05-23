import {
  expect,
  expectSyncRoot,
  removeSyncRootEntry,
  setSyncDirection,
  syncValidBookFixtureToSource,
  test,
  VALID_BOOK_TITLE,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('boot with "Up only" sync preserves local books missing from the source', async ({ page }) => {
  await syncValidBookFixtureToSource(page);

  await setSyncDirection(page, 'Up only');
  await removeSyncRootEntry(page, VALID_BOOK_TITLE);
  await expectSyncRoot(page, []);

  await page.reload();
  await waitForSyncIdle(page);

  await page.goto('/manage');
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible();
});
