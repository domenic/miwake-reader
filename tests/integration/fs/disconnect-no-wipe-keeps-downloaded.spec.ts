import { resolve } from 'node:path';
import { expect, test } from '../helpers/harness.ts';

const VALID_EPUB = resolve(import.meta.dirname, '../fixtures/books/valid-japanese.epub');

test('disconnecting without wipe keeps downloaded books on the device', async ({ page }) => {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 15_000 });

  await page.goto('/manage');
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
  await page.locator('input[accept*="epub"]').first().setInputFiles(VALID_EPUB);
  await expect(page.getByText('テスト用の本')).toBeVisible();
  // Wait for the import-triggered ambient push to drain.
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 15_000 });

  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Disconnect' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Disconnect your sync folder?');
  await dialog.getByRole('button', { name: 'Disconnect' }).click();
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible();

  await page.goto('/manage');
  await expect(page.getByText('テスト用の本')).toBeVisible();
});
