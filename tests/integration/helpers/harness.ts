import { resolve } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };

const VALID_BOOK_FILENAME = 'valid-japanese.epub';

export const VALID_BOOK_TITLE = 'テスト用の本';

/**
 * Extended Playwright test with the OPFS-backed showDirectoryPicker mock installed via
 * context.addInitScript. Tests should import `test` and `expect` from this module instead of
 * `@playwright/test`.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(pickerInitScript);
    await use(context);
  }
});

export async function connectFS(page: Page) {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await waitForSyncIdle(page);
}

export function bookFixturePath(filename: string) {
  return resolve(import.meta.dirname, `../fixtures/books/${filename}`);
}

export async function importFiles(page: Page, files: string | string[]) {
  // Wait for Svelte to hydrate before driving the hidden file input; its `use:inputFile`
  // directive attaches the change listener on mount.
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
  await page.locator('input[accept*="epub"]').first().setInputFiles(files);
}

export async function importValidBookFixture(page: Page) {
  await page.goto('/manage');
  await importFiles(page, bookFixturePath(VALID_BOOK_FILENAME));
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible({ timeout: 15_000 });
}

export async function waitForSyncIdle(page: Page) {
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 15_000 });
}

export async function listOPFS(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
    const result: string[] = [];

    for await (const [dirName, dirHandle] of root.entries()) {
      if (dirHandle.kind === 'directory') {
        for await (const [fileName] of dirHandle.entries()) {
          result.push(`${dirName}/${fileName}`);
        }
      } else {
        result.push(dirName);
      }
    }

    return result.sort();
  });
}

/**
 * Init script: runs in the page before any app code. Patches showDirectoryPicker to return an
 * OPFS-backed handle rooted at /fake-sync, and patches FileSystemDirectoryHandle permission methods
 * to return 'granted' so the app's permission gate is no-op in tests.
 *
 * showDirectoryPicker isn't driveable from Playwright (user-gesture-gated with native chrome).
 * FileSystemDirectoryHandle is structurally identical whether it comes from the picker or from
 * navigator.storage.getDirectory, so substituting an OPFS handle gives the app a fully-functional
 * filesystem to write to without any picker UI.
 */
function pickerInitScript() {
  FileSystemDirectoryHandle.prototype.queryPermission = async () => 'granted';
  FileSystemDirectoryHandle.prototype.requestPermission = async () => 'granted';

  window.showDirectoryPicker = async () => {
    const opfs = await navigator.storage.getDirectory();
    return opfs.getDirectoryHandle('fake-sync', { create: true });
  };
}
