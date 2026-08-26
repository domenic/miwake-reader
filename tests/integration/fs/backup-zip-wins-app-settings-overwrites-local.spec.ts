import { expect, test } from '../helpers/harness.ts';
import { navigateToSettingsTracking } from '../helpers/navigation.ts';
import {
  enableStatistics,
  exportBackup,
  importBackup,
  setSettingsSwitch,
  signOutAndWipe
} from '../helpers/workflows.ts';

test('backup import with "ZIP wins" overwrites local app settings', async ({ page }, testInfo) => {
  const backupPath = testInfo.outputPath('app-settings-backup.zip');

  await enableStatistics(page);
  await exportBackup(page, backupPath, { appSettings: true });

  await signOutAndWipe(page);
  await enableStatistics(page);
  await setSettingsSwitch(page, 'Track reading activity', false);

  await importBackup(page, backupPath, { direction: 'ZIP wins' });

  await navigateToSettingsTracking(page);
  await expect(page.getByRole('switch', { name: 'Track reading activity' })).toBeChecked();
});
