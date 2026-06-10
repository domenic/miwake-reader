import { readFile, stat, writeFile } from 'node:fs/promises';
import type { Locator, Page } from '@playwright/test';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from './helpers/harness.ts';
import { exportBackup } from './helpers/workflows.ts';

test('backup export downloads a ZIP file', async ({ page }, testInfo) => {
  const backupPath = testInfo.outputPath('app-settings-backup.zip');

  const download = await exportBackup(page, backupPath, { appSettings: true });

  expect(download.suggestedFilename()).toMatch(/^miwake-reader-export-[\d-]+\.zip$/);
  expect((await stat(backupPath)).size).toBeGreaterThan(0);
});

test('character-count import downloads updated counts JSON without adding the book', async ({
  page
}, testInfo) => {
  const countDataPath = testInfo.outputPath('counts.json');
  const textBookPath = testInfo.outputPath('count-me.txt');
  const downloadedCountsPath = testInfo.outputPath('downloaded-counts.json');

  await writeFile(countDataPath, '{}');
  await writeFile(textBookPath, 'Count me.\nAnother line.\n');

  await page.goto('/manage?count');
  await expect(page.locator('#app-shell')).not.toHaveAttribute('inert', '', {
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  const countButton = page.getByRole('button', { name: 'C', exact: true });
  await chooseFile(page, countButton, countDataPath);
  await expect(countButton).toHaveCSS('color', 'rgb(255, 0, 0)');

  const downloadPromise = page.waitForEvent('download');
  await chooseFile(page, page.getByRole('button', { name: 'Import Files' }), textBookPath);

  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('characters.json');
  await download.saveAs(downloadedCountsPath);

  const counts = JSON.parse(await readFile(downloadedCountsPath, 'utf8'));
  expect(counts['count-me.txt']).toBeGreaterThan(0);
  await expect(page.getByText('count-me', { exact: true })).toHaveCount(0);
});

async function chooseFile(page: Page, button: Locator, path: string) {
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), button.click()]);
  await fileChooser.setFiles(path);
}
