import { expect, type Page } from '@playwright/test';
import {
  pickSyncRootOnNextPicker,
  SYNC_ASSERTION_TIMEOUT,
  type SyncRootOptions
} from './harness.ts';
import { expectBooksInSyncRoot, importBookFixtures, type LibraryBookFixture } from './fixtures.ts';

export async function connectFS(page: Page, options?: SyncRootOptions) {
  await page.goto('/settings/sync');
  if (options?.rootName) {
    await pickSyncRootOnNextPicker(page, options.rootName);
  }
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

/**
 * Imports book fixtures, connects a fresh sync source, and waits for those fixtures to appear as
 * top-level source folders.
 *
 * Use this when source copies are setup for the scenario under test. Importing before connection
 * lets the source-connection mirror do the upload; that is less racy than importing into an
 * already-connected source and waiting for the ambient debounced push.
 */
export async function syncBookFixturesToSource(
  page: Page,
  fixtures: readonly LibraryBookFixture[],
  options?: SyncRootOptions
) {
  await importBookFixtures(page, fixtures);
  await connectFS(page, options);
  await expectBooksInSyncRoot(page, fixtures, options);
}

export async function openDisconnectDialog(page: Page) {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Disconnect' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Disconnect your sync folder?');
  return dialog;
}

export async function openChangeFolderDialog(page: Page) {
  await page.goto('/settings/sync');
  await page.getByRole('button', { name: 'Change folder' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Switch to your sync folder?');
  return dialog;
}

export async function completeCurrentBook(page: Page) {
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await page.getByRole('button', { name: 'Complete Book' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Confirm' }).click();
  await expect(page.getByRole('button', { name: 'Undo Complete' })).toBeVisible();
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
  // `waitForSuccessfulSync()` can otherwise match the previous idle
  // indicator before the async force-resync handler has had a chance
  // to flip sync state. First observe the explicit operation starting,
  // then wait for the new successful idle state.
  await expect(
    page.locator('button[aria-label^="Sync pending"], button[aria-label^="Syncing"]')
  ).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
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
