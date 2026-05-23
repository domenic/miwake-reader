import { expect, expectSyncRoot, test } from '../helpers/harness.ts';
import {
  connectFS,
  enableStatistics,
  signOutAndWipe,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

test('sync pushes reading goals with no books to the source', async ({ page }) => {
  await enableStatistics(page, 'Reading Goals');

  await expect(page.getByRole('heading', { name: 'Reading Goals' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  const timeGoal = page
    .getByText('Time Goal (Min)', { exact: true })
    .locator('input[type="number"]');
  const startDate = page.getByText('Start Date', { exact: true }).locator('input[type="date"]');
  await timeGoal.fill('30');
  await startDate.fill('2026-05-22');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(timeGoal).toHaveValue('30');

  await connectFS(page);
  await waitForSuccessfulSync(page);

  await expectSyncRoot(page, [
    {
      kind: 'file',
      name: expect.stringMatching(/^miwake-user-goals_\d+_\d+_\d+\.json$/)
    }
  ]);

  await signOutAndWipe(page);
  await connectFS(page);

  await enableStatistics(page, 'Reading Goals');
  await expect(timeGoal).toHaveValue('30');
  await expect(startDate).toHaveValue('2026-05-22');
});
