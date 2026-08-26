import { expect, test } from '../helpers/harness.ts';
import { navigateToStatisticsGoals } from '../helpers/navigation.ts';
import {
  connectFS,
  expectReadingGoalsInSyncRoot,
  signOutAndWipe,
  waitForSuccessfulSync
} from '../helpers/workflows.ts';

test('sync pushes reading goals with no books to the source', async ({ page }) => {
  await navigateToStatisticsGoals(page);

  await expect(page.getByRole('heading', { name: 'Reading Goals' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit' }).click();
  const timeGoal = page.getByLabel('Reading time goal (minutes)');
  const startDate = page.getByLabel('Start date');
  await timeGoal.fill('30');
  await startDate.fill('2026-05-22');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(timeGoal).toHaveValue('30');

  await connectFS(page);
  await waitForSuccessfulSync(page);

  await expectReadingGoalsInSyncRoot(page);

  await signOutAndWipe(page);
  await connectFS(page);

  await navigateToStatisticsGoals(page);
  await expect(timeGoal).toHaveValue('30');
  await expect(startDate).toHaveValue('2026-05-22');
});
