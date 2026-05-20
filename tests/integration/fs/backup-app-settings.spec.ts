import { expect, exportBackup, importBackup, signOutAndWipe, test } from '../helpers/harness.ts';

test('backup import restores app settings after a local wipe', async ({ page }, testInfo) => {
  const backupPath = testInfo.outputPath('app-settings-backup.zip');

  await page.goto('/settings/statistics');
  await page
    .locator('section')
    .filter({ has: page.getByRole('heading', { name: 'Enable Statistics' }) })
    .getByRole('button', { name: 'On', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeVisible();

  await exportBackup(page, backupPath, { appSettings: true });
  await signOutAndWipe(page);

  await page.goto('/settings/statistics');
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeHidden();

  await importBackup(page, backupPath);
  await page.goto('/settings/statistics');
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeVisible();
});
