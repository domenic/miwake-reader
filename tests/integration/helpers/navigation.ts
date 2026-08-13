import { expect, type Page } from '@playwright/test';
import { SYNC_ASSERTION_TIMEOUT } from './harness.ts';
import { readerIsMounted, showReaderHeader } from './reader.ts';

type AppPath =
  | '/manage'
  | '/settings/reader'
  | '/settings/sync'
  | '/settings/statistics'
  | '/statistics';

interface NavigationOptions {
  readerExitDialog?: 'none' | 'confirm';
}

/**
 * Playwright pages start at `about:blank`, where there is no app UI to click yet. Keep the one
 * real browser navigation here, and land directly on a stable app route so the navigation helpers
 * do not need to wait for the home route's automatic redirect. All other helpers can then move
 * through SvelteKit's client-side navigation, which matches user behavior and does not restart
 * boot-time sync reconciliation.
 */
export async function loadApp(page: Page) {
  if (page.url() === 'about:blank') {
    await page.goto('/manage');
  }

  await expect(page.locator('#app-shell')).not.toHaveAttribute('inert', '', {
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}

export async function navigateToManage(page: Page, options?: NavigationOptions) {
  await navigateWithGlobalTab(page, 'Manager', (path) => path === '/manage', options);
}

export async function navigateToSettingsReader(page: Page, options?: NavigationOptions) {
  await navigateToSettingsSection(page, '/settings/reader', 'Reader', options);
}

export async function navigateToSettingsSync(page: Page, options?: NavigationOptions) {
  await navigateToSettingsSection(page, '/settings/sync', 'Sync', options);
}

export async function navigateToSettingsStatistics(page: Page, options?: NavigationOptions) {
  await navigateToSettingsSection(page, '/settings/statistics', 'Statistics', options);
}

export async function navigateToStatisticsSummary(page: Page, options?: NavigationOptions) {
  await loadApp(page);
  const readerMounted = await readerIsMounted(page);
  if (
    currentPath(page) !== '/statistics' ||
    currentStatisticsView(page) !== 'summary' ||
    readerMounted
  ) {
    if (currentPath(page) !== '/statistics' || readerMounted) {
      await navigateWithGlobalTab(page, 'Statistics', (path) => path === '/statistics', options);
    }

    if (currentStatisticsView(page) !== 'summary') {
      await page.getByRole('link', { name: 'Summary', exact: true }).click();
    }
  }
  await expectPath(page, '/statistics');
  await expectStatisticsView(page, 'summary');
}

async function navigateToSettingsSection(
  page: Page,
  path: AppPath,
  tabName: string,
  options?: NavigationOptions
) {
  await loadApp(page);
  const readerMounted = await readerIsMounted(page);
  if (currentPath(page) !== path || readerMounted) {
    if (!currentPath(page).startsWith('/settings') || readerMounted) {
      await navigateWithGlobalTab(
        page,
        'Settings',
        (current) => current.startsWith('/settings'),
        options
      );
    }

    await page.getByRole('link', { name: tabName, exact: true }).first().click();
  }
  await expectPath(page, path);
}

async function navigateWithGlobalTab(
  page: Page,
  tabName: 'Manager' | 'Settings' | 'Statistics',
  isExpectedPath: (path: string) => boolean,
  options: NavigationOptions = {}
) {
  await loadApp(page);
  const path = currentPath(page);
  const readerMounted = await readerIsMounted(page);
  if (isExpectedPath(path) && !readerMounted) return;

  if (readerMounted) {
    await navigateFromReader(page, tabName, options);
  } else {
    await page.getByRole('link', { name: tabName, exact: true }).last().click();
  }
  await expect
    .poll(async () => isExpectedPath(currentPath(page)) && !(await readerIsMounted(page)), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(true);
}

async function navigateFromReader(
  page: Page,
  tabName: 'Manager' | 'Settings' | 'Statistics',
  { readerExitDialog = 'none' }: NavigationOptions
) {
  let header = page.getByRole('toolbar', { name: 'Reader controls' });
  if ((await header.getAttribute('inert')) !== null) {
    header = await showReaderHeader(page);
  }
  await header.getByRole('link', { name: tabName, exact: true }).click();
  await assertExpectedReaderExitDialog(page, readerExitDialog);
}

async function assertExpectedReaderExitDialog(
  page: Page,
  expectation: NonNullable<NavigationOptions['readerExitDialog']>
) {
  const dialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Confirm exit' })
  });
  if (expectation === 'none') {
    await expect(dialog).toHaveCount(0, { timeout: 500 });
    return;
  }

  await expect(dialog.getByRole('heading', { name: 'Confirm exit' })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await dialog.getByRole('button', { name: 'Continue' }).click();
}

async function expectPath(page: Page, path: AppPath) {
  await expect.poll(() => currentPath(page), { timeout: SYNC_ASSERTION_TIMEOUT }).toBe(path);
}

function currentPath(page: Page) {
  return new URL(page.url()).pathname;
}

function currentStatisticsView(page: Page) {
  return new URL(page.url()).searchParams.get('view');
}

async function expectStatisticsView(page: Page, view: 'summary' | 'heatmap') {
  await expect
    .poll(() => currentStatisticsView(page), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toBe(view);
}
