import { expect, test } from '../helpers/harness.ts';

test('goals are available without tracking and tab navigation preserves the book filter', async ({
  page
}) => {
  const title = 'A filtered book';
  await page.goto(`/statistics?${new URLSearchParams({ view: 'goals', t: title })}`);

  await expect(page).toHaveURL(`/statistics?${new URLSearchParams({ view: 'goals', t: title })}`);
  await expect(page.getByRole('heading', { name: 'Reading Goals' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  const timeGoal = page.getByLabel('Reading time goal (minutes)');
  const startDate = page.getByLabel('Start date');
  await timeGoal.fill('20');
  await page.getByLabel('Goal window').selectOption({ label: '7-day window' });
  await startDate.fill('2026-08-16');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Delete goals', exact: true })).toBeVisible();
  await expect(timeGoal).toHaveValue('20');

  await page.getByRole('link', { name: 'Summary', exact: true }).click();
  await expect(page).toHaveURL(`/statistics?${new URLSearchParams({ view: 'summary', t: title })}`);
  await expect(page.getByLabel('Statistics summary')).toBeVisible();
});
