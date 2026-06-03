import { test } from '../helpers/harness.ts';
import {
  expectReadingGoal,
  exportBackup,
  importBackup,
  setReadingGoal,
  signOutAndWipe
} from '../helpers/workflows.ts';

test('backup import with "Keep newest" uses the reading-goal timestamp', async ({
  page
}, testInfo) => {
  const backupPath = testInfo.outputPath('reading-goal-backup.zip');

  await page.clock.install({ time: new Date('2026-05-10T12:00:00Z') });
  await setReadingGoal(page, { timeGoal: '60', startDate: '2026-05-10' });
  await exportBackup(page, backupPath, { readingGoals: true });

  await signOutAndWipe(page);
  await page.clock.setSystemTime(new Date('2026-05-09T12:00:00Z'));
  await setReadingGoal(page, { timeGoal: '5', startDate: '1999-01-01' });
  await expectReadingGoal(page, { timeGoal: '5', startDate: '1999-01-01' });

  await importBackup(page, backupPath, { direction: 'Keep newest' });

  await expectReadingGoal(page, { timeGoal: '60', startDate: '2026-05-10' });
});
