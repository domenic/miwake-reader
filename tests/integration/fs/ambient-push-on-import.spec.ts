import {
  connectFS,
  expect,
  importValidBookFixture,
  listOPFS,
  test,
  waitForSyncIdle
} from '../helpers/harness.ts';

test('importing a book while FS sync is connected pushes book data to OPFS', async ({ page }) => {
  await connectFS(page);
  await expect.poll(() => listOPFS(page)).toEqual([]);

  await importValidBookFixture(page);
  await waitForSyncIdle(page);

  await expect
    .poll(() => listOPFS(page), { timeout: 15_000 })
    .toEqual(expect.arrayContaining([expect.stringMatching(/\/bookdata_/)]));
});
