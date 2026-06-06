import { expect, type Page } from '@playwright/test';
import {
  listSyncRoot,
  pickSyncRootOnNextPicker,
  SYNC_ASSERTION_TIMEOUT,
  type SyncRootOptions
} from './harness.ts';
import { navigateToSettingsStatistics, navigateToSettingsSync } from './navigation.ts';
import { expectBooksInSyncRoot, importBookFixtures, type LibraryBookFixture } from './fixtures.ts';

export async function connectFS(page: Page, options?: SyncRootOptions) {
  await navigateToSettingsSync(page);
  if (options?.rootName) {
    await pickSyncRootOnNextPicker(page, options.rootName);
  }
  await page.getByRole('button', { name: 'Choose folder' }).click();
  await expect(page.getByText('Connected')).toBeVisible();
  await waitForSyncIdle(page);
}

export async function signOutAndWipe(page: Page) {
  await navigateToSettingsSync(page);
  await page.getByRole('button', { name: 'Sign out and wipe' }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Sign out and wipe local data?');
  await Promise.all([
    page.waitForURL('/manage'),
    dialog.getByRole('button', { name: 'Sign out and wipe' }).click()
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
  await navigateToSettingsSync(page);
  await page.getByRole('button', { name: 'Disconnect' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Disconnect your sync folder?');
  return dialog;
}

export async function openChangeFolderDialog(page: Page) {
  await navigateToSettingsSync(page);
  await page.getByRole('button', { name: 'Change folder' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading')).toContainText('Switch to your sync folder?');
  return dialog;
}

export async function completeCurrentBook(page: Page) {
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await page.getByRole('button', { name: 'Complete Book' }).click();
  await page.locator('dialog[open]').getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByRole('button', { name: 'Undo Complete' })).toBeVisible();
}

export async function setSyncDirection(page: Page, direction: 'Up only' | 'Down only' | 'Off') {
  await navigateToSettingsSync(page);
  await page.getByText('Advanced').click();
  await page.getByRole('group', { name: 'Sync direction' }).getByLabel(direction).check();
}

export async function enableStatistics(page: Page, enabledHeading = 'Tracker Auto Pause') {
  await navigateToSettingsStatistics(page);
  const enableStatisticsSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Enable Statistics' })
  });

  await enableStatisticsSection.getByRole('button', { name: 'On', exact: true }).click();
  await expect(page.getByRole('heading', { name: enabledHeading })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}

export async function setReadingGoal(
  page: Page,
  { timeGoal, startDate }: { timeGoal: string; startDate: string }
) {
  const { timeGoal: timeGoalInput, startDate: startDateInput } = await openReadingGoals(page);
  await page.getByRole('button', { name: 'Edit' }).click();
  await timeGoalInput.fill(timeGoal);
  await startDateInput.fill(startDate);
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('button', { name: 'Edit' })).toBeVisible();
  await expect(timeGoalInput).toHaveValue(timeGoal);
  await expect(startDateInput).toHaveValue(startDate);
}

export async function expectReadingGoal(
  page: Page,
  { timeGoal, startDate }: { timeGoal: string; startDate: string }
) {
  const { timeGoal: timeGoalInput, startDate: startDateInput } = await openReadingGoals(page);
  await expect(timeGoalInput).toHaveValue(timeGoal);
  await expect(startDateInput).toHaveValue(startDate);
}

export async function expectReadingGoalsInSyncRoot(page: Page, options?: SyncRootOptions) {
  await expect
    .poll(() => listSyncRoot(page, options), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toEqual([
      {
        kind: 'file',
        name: expect.stringMatching(/^miwake-user-goals_\d+_\d+_\d+\.json$/)
      }
    ]);
}

export async function forceFullResync(
  page: Page,
  direction: 'Keep newest' | 'This device wins' | 'Sync location wins' = 'Keep newest'
) {
  await navigateToSettingsSync(page);
  await waitForSyncIdle(page);
  await forceFullResyncFromSettings(page, direction);
}

/**
 * Drives the Force full re-sync dialog from an already-open Settings → Sync page.
 *
 * Tests that mutate OPFS while already viewing this page use this lower-level helper so the next
 * user action is the re-sync itself. That keeps the test focused on force re-sync instead of route
 * changes or helper setup.
 */
export async function forceFullResyncFromSettings(
  page: Page,
  direction: 'Keep newest' | 'This device wins' | 'Sync location wins' = 'Keep newest'
) {
  await expect(page).toHaveURL('/settings/sync');
  const previousLastSyncedAt = await syncLocationLastSyncedDateTime(page);
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
  await expect(dialog).toHaveCount(0);
  // Settings -> Sync renders the exact last-sync time as `<time datetime>`. Waiting for that
  // value to advance gives the test a durable completion marker, unlike the fleeting "Syncing..."
  // label that fast no-op syncs may never paint.
  await expect
    .poll(() => syncLocationLastSyncedDateTime(page), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .not.toBe(previousLastSyncedAt);
  await waitForSuccessfulSync(page);
}

export async function exportBackup(
  page: Page,
  path: string,
  selection: {
    allBooks?: boolean;
    allBookmarks?: boolean;
    allStatistics?: boolean;
    appSettings?: boolean;
    readingGoals?: boolean;
  }
) {
  await navigateToSettingsSync(page);
  await page.getByRole('button', { name: 'Export' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Export backup' })).toBeVisible();

  if (selection.readingGoals) {
    await dialog.getByLabel('Reading goals').check();
  }
  if (selection.allBooks) {
    await dialog.getByLabel('Select all').check();
  }
  if (selection.allBookmarks) {
    await dialog.getByLabel('All bookmarks').check();
  }
  if (selection.allStatistics) {
    await dialog.getByLabel('All statistics').check();
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

export async function importBackup(
  page: Page,
  path: string,
  { direction = 'Keep newest' }: { direction?: 'Keep newest' | 'ZIP wins' } = {}
) {
  await navigateToSettingsSync(page);

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('button', { name: 'Import' }).click()
  ]);
  await fileChooser.setFiles(path);

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Import backup' })).toBeVisible();
  await dialog
    .getByRole('group', { name: 'When the ZIP and this device disagree' })
    .getByLabel(direction)
    .check();
  await Promise.all([
    page.waitForURL('/manage', { timeout: 30_000 }),
    dialog.getByRole('button', { name: 'Import' }).click()
  ]);
}

/**
 * Waits for sync work to drain. A connected source only proves the app has a handle or cloud
 * account; it does not prove ambient pushes, boot reconcile, or force re-sync work has finished.
 */
export async function waitForSyncIdle(page: Page) {
  await expect(page.getByRole('button', { name: /^(Synced|Up to date)/ })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}

/**
 * Waits for an explicitly successful sync state. Use this when the scenario needs a completed
 * source operation, not merely an idle "Up to date" state with sync disabled or disconnected.
 */
export async function waitForSuccessfulSync(page: Page) {
  await expect(page.getByRole('button', { name: /^Synced/ })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}

async function openReadingGoals(page: Page) {
  await navigateToSettingsStatistics(page);
  const readingGoalsHeading = page.getByRole('heading', { name: 'Reading Goals' });
  if ((await readingGoalsHeading.count()) === 0) {
    await enableStatistics(page, 'Reading Goals');
  }

  await expect(readingGoalsHeading).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
  return {
    timeGoal: page.getByText('Time Goal (Min)', { exact: true }).locator('input[type="number"]'),
    startDate: page.getByText('Start Date', { exact: true }).locator('input[type="date"]')
  };
}

async function syncLocationLastSyncedDateTime(page: Page) {
  const syncLocationSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Sync location' })
  });
  const lastSyncedTime = syncLocationSection.locator('time[datetime]').first();
  if ((await lastSyncedTime.count()) === 0) return null;

  return lastSyncedTime.getAttribute('datetime');
}
