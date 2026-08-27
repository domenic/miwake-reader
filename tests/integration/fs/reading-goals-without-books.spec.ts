import { expect, test } from '../helpers/harness.ts';
import { navigateToStatisticsGoals } from '../helpers/navigation.ts';
import {
  connectFS,
  expectReadingGoal,
  expectReadingGoalsInSyncRoot,
  setReadingGoal,
  signOutAndWipe,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

const READING_GOAL = { timeGoal: '30', startDate: '2026-05-22' };

test('sync pushes reading goals with no books to the source', async ({ page }) => {
  await setReadingGoal(page, READING_GOAL);

  await connectFS(page);
  await waitForSuccessfulSync(page);

  await expectReadingGoalsInSyncRoot(page, [READING_GOAL.startDate]);

  await signOutAndWipe(page);
  await connectFS(page);

  await expectReadingGoal(page, READING_GOAL);
});

test('deleting reading goals pushes an empty replacement under the default merge mode', async ({
  page
}) => {
  await setReadingGoal(page, READING_GOAL);
  await connectFS(page);
  await waitForSuccessfulSync(page);
  await expectReadingGoalsInSyncRoot(page, [READING_GOAL.startDate]);

  await navigateToStatisticsGoals(page);
  await page.getByRole('button', { name: 'Delete goals', exact: true }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Data deletion' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toHaveCount(0);

  await expect(page.getByLabel('Reading time goal (minutes)')).toHaveValue('0');
  await waitForSuccessfulSync(page);
  await expectReadingGoalsInSyncRoot(page, []);
});
