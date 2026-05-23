import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import { expectSyncRoot, SYNC_ASSERTION_TIMEOUT } from './harness.ts';

const VALID_BOOK_FILENAME = 'valid-japanese.epub';

export const VALID_BOOK_TITLE = 'テスト用の本';

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
  await expect(page.getByText('Drop files here or click to upload')).toBeVisible();
  await page.locator('input[accept*="epub"]').first().setInputFiles(files);
}

export async function importValidBookFixture(page: Page) {
  await page.goto('/manage');
  await importFiles(page, bookFixturePath(VALID_BOOK_FILENAME));
  await expect(page.getByText(VALID_BOOK_TITLE)).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
}

/**
 * Imports the shared valid book fixture, connects a fresh sync source, and waits for the fixture to
 * appear as a top-level source folder.
 *
 * Use this when the source copy is setup for the scenario under test. Importing before connection
 * lets the source-connection mirror do the upload; that is less racy than importing into an already
 * connected source and waiting for the ambient debounced push.
 */
export async function syncValidBookFixtureToSource(page: Page) {
  await importValidBookFixture(page);
  await connectFS(page);
  await expectSyncRoot(page, [{ kind: 'directory', name: VALID_BOOK_TITLE }]);
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

export async function openDisconnectDialog(page: Page) {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Disconnect' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Disconnect your sync folder?');
  return dialog;
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

  await enableStatisticsSection.getByRole('button', { name: 'On', exact: true }).click();
  await expect(page.getByRole('heading', { name: enabledHeading })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
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
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}

export async function waitForSuccessfulSync(page: Page) {
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}
