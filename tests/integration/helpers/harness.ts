import { resolve } from 'node:path';
import { test as base, expect, type Page } from '@playwright/test';

export { expect };

interface RemoveEntryCall {
  directoryName: string;
  name: string;
  recursive: boolean;
}

declare global {
  interface Window {
    __miwakeTestRemoveEntryLog?: RemoveEntryCall[];
    __miwakeTestSetVisibilityState?: (state: DocumentVisibilityState) => void;
  }
}

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

export async function signOutAndWipe(page: Page) {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Sign out and wipe' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Sign out and wipe local data?');
  await Promise.all([
    page.waitForURL('/'),
    dialog.getByRole('button', { name: 'Confirm' }).click()
  ]);
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

export async function deleteBookFromManage(page: Page, title: string) {
  await page.goto('/manage');
  const bookTitle = page.getByText(title, { exact: true });
  await expect(bookTitle).toBeVisible();

  await page.getByRole('button', { name: 'Select' }).click();
  await bookTitle.click();
  await page.getByRole('button', { name: 'Delete Book' }).click();

  await expect(bookTitle).toHaveCount(0);
}

export async function setSyncDirection(page: Page, direction: 'Up only' | 'Down only' | 'Off') {
  await page.goto('/settings/sync');
  await page.getByText('Advanced').click();
  await page.getByRole('group', { name: 'Sync direction' }).getByLabel(direction).check();
}

export async function enableStatistics(page: Page, enabledHeading = 'Tracker Auto Pause') {
  await page.goto('/settings/statistics');
  const enableStatisticsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Enable Statistics' })
  });

  await expect(async () => {
    await enableStatisticsSection.getByRole('button', { name: 'On', exact: true }).click();
    await expect(page.getByRole('heading', { name: enabledHeading })).toBeVisible({
      timeout: 1_000
    });
  }).toPass({ timeout: 10_000 });
}

export async function forceFullResync(
  page: Page,
  direction: 'Keep newest' | 'This device wins' | 'Sync location wins' = 'Keep newest'
) {
  await page.goto('/settings/sync');
  await forceFullResyncFromSettings(page, direction);
}

/**
 * Drives the Force full re-sync dialog from an already-open Settings → Sync page.
 *
 * Most workflow helpers navigate to their owning route themselves. This lower-level helper exists
 * for source-deletion tests where a navigation would remount the app and run boot reconcile before
 * the test can choose "This device wins". In that state, boot reconcile correctly treats the source
 * listing as authoritative and can prune the local book that the local-wins resync is supposed to
 * push back up.
 */
export async function forceFullResyncFromSettings(
  page: Page,
  direction: 'Keep newest' | 'This device wins' | 'Sync location wins' = 'Keep newest'
) {
  await expect(page).toHaveURL(/\/settings\/sync(?:$|[?#])/);
  await page.getByRole('button', { name: 'Re-sync' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Force full re-sync');

  if (direction !== 'Keep newest') {
    await dialog.getByRole('group', { name: 'Direction' }).getByLabel(direction).check();
  }

  const confirmLabel =
    direction === 'Keep newest'
      ? 'Reconcile'
      : direction === 'This device wins'
        ? 'Push over'
        : 'Pull over';
  await dialog.getByRole('button', { name: confirmLabel }).click();
  await waitForSuccessfulSync(page);
}

export async function exportBackup(
  page: Page,
  path: string,
  selection: { allBooks?: boolean; appSettings?: boolean }
) {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Export' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Export backup' })).toBeVisible();

  if (selection.allBooks) {
    await dialog.getByLabel('Select all').check();
  }
  if (selection.appSettings) {
    await dialog.getByLabel('App settings').check();
  }

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    dialog.getByRole('button', { name: 'Export' }).click()
  ]);
  await download.saveAs(path);
}

export async function importBackup(page: Page, path: string) {
  await page.goto('/settings/sync');

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import' }).click()
  ]);
  await fileChooser.setFiles(path);

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Import backup' })).toBeVisible();
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/' || url.pathname === '/manage', {
      timeout: 30_000
    }),
    dialog.getByRole('button', { name: 'Import' }).click()
  ]);
}

export async function waitForSyncIdle(page: Page) {
  await expect(page.getByRole('button', { name: /^(Synced|Up to date)/ })).toBeVisible({
    timeout: 15_000
  });
}

export async function waitForSuccessfulSync(page: Page) {
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({ timeout: 15_000 });
}

export async function listSyncRoot(page: Page): Promise<Array<{ kind: string; name: string }>> {
  return page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
    const result: Array<{ kind: string; name: string }> = [];

    for await (const [name, handle] of root.entries()) {
      result.push({ kind: handle.kind, name });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function clearRemoveEntryLog(page: Page) {
  await page.evaluate(() => {
    window.__miwakeTestRemoveEntryLog = [];
  });
}

export async function listRemoveEntryLog(page: Page): Promise<RemoveEntryCall[]> {
  return page.evaluate(() => window.__miwakeTestRemoveEntryLog ?? []);
}

export async function removeSyncRootEntry(page: Page, name: string) {
  await page.evaluate(
    async ({ name }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
      await root.removeEntry(name, { recursive: true });
    },
    { name }
  );
}

export async function setDocumentVisibility(page: Page, state: DocumentVisibilityState) {
  await page.evaluate((state) => {
    window.__miwakeTestSetVisibilityState?.(state);
  }, state);
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
 *
 * Playwright 1.60 does not expose a public API for making a headless page become hidden, and
 * `page.bringToFront()` leaves all pages visible in this runner. Chromium's lifecycle CDP hooks
 * also do not update `document.visibilityState` or fire `visibilitychange`, so the same init script
 * installs a narrow Page Visibility seam that tests can drive with `setDocumentVisibility()`.
 */
function pickerInitScript() {
  FileSystemDirectoryHandle.prototype.queryPermission = async () => 'granted';
  FileSystemDirectoryHandle.prototype.requestPermission = async () => 'granted';

  let testVisibilityState: DocumentVisibilityState = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => testVisibilityState
  });
  window.__miwakeTestSetVisibilityState = (state: DocumentVisibilityState) => {
    testVisibilityState = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  window.__miwakeTestRemoveEntryLog = [];
  const originalRemoveEntry = FileSystemDirectoryHandle.prototype.removeEntry;
  FileSystemDirectoryHandle.prototype.removeEntry = async function (
    this: FileSystemDirectoryHandle,
    name: string,
    options?: { recursive?: boolean }
  ) {
    window.__miwakeTestRemoveEntryLog?.push({
      directoryName: this.name,
      name,
      recursive: options?.recursive === true
    });
    return originalRemoveEntry.call(this, name, options);
  };

  window.showDirectoryPicker = async () => {
    const opfs = await navigator.storage.getDirectory();
    return opfs.getDirectoryHandle('fake-sync', { create: true });
  };
}
