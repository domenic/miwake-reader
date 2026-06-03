import { expect, test } from '../helpers/harness.ts';
import { navigateToSettingsStatistics } from '../helpers/navigation.ts';
import {
  enableStatistics,
  exportBackup,
  importBackup,
  signOutAndWipe
} from '../helpers/workflows.ts';

test('backup import restores app settings after a local wipe', async ({ page }, testInfo) => {
  const backupPath = testInfo.outputPath('app-settings-backup.zip');

  await enableStatistics(page);

  await exportBackup(page, backupPath, { appSettings: true });
  await signOutAndWipe(page);

  await navigateToSettingsStatistics(page);
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeHidden();

  await importBackup(page, backupPath);
  await navigateToSettingsStatistics(page);
  await expect(page.getByRole('heading', { name: 'Tracker Auto Pause' })).toBeVisible();
});
