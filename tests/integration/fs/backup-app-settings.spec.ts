import { expect, test } from '../helpers/harness.ts';
import { navigateToSettingsTracking } from '../helpers/navigation.ts';
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

  await navigateToSettingsTracking(page);
  await expect(page.getByRole('switch', { name: 'Track reading activity' })).not.toBeChecked();

  await importBackup(page, backupPath);
  await navigateToSettingsTracking(page);
  await expect(page.getByRole('switch', { name: 'Track reading activity' })).toBeChecked();
});
