import { expect, test } from '../helpers/harness.ts';
import { navigateToSettingsStatistics } from '../helpers/navigation.ts';
import {
  enableStatistics,
  exportBackup,
  importBackup,
  signOutAndWipe
} from '../helpers/workflows.ts';

test('backup import with "ZIP wins" overwrites local app settings', async ({ page }, testInfo) => {
  const backupPath = testInfo.outputPath('app-settings-backup.zip');

  await enableStatistics(page);
  await exportBackup(page, backupPath, { appSettings: true });

  await signOutAndWipe(page);
  await enableStatistics(page);
  await navigateToSettingsStatistics(page);
  const enableStatisticsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Enable Statistics' })
  });
  await enableStatisticsSection.getByRole('button', { name: 'Off', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeHidden();

  await importBackup(page, backupPath, { direction: 'ZIP wins' });

  await navigateToSettingsStatistics(page);
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeVisible();
});
