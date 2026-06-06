import { expect, type Page } from '@playwright/test';
import { SYNC_ASSERTION_TIMEOUT } from './harness.ts';

type AppPath =
  | '/manage'
  | '/settings/reader'
  | '/settings/sync'
  | '/settings/statistics'
  | '/statistics/summary';

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
  if (currentPath(page) !== '/statistics/summary' || readerMounted) {
    if (!currentPath(page).startsWith('/statistics') || readerMounted) {
      await navigateWithGlobalTab(
        page,
        'Statistics',
        (path) => path.startsWith('/statistics'),
        options
      );
    }

    await page.getByRole('button', { name: 'Summary', exact: true }).click();
  }
  await expectPath(page, '/statistics/summary');
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

    await page.getByRole('button', { name: tabName, exact: true }).first().click();
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
    await page.getByRole('button', { name: tabName, exact: true }).last().click();
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
  const readerHeader = await showReaderHeader(page);
  await readerHeader.getByRole('button', { name: tabName, exact: true }).click();
  await assertExpectedReaderExitDialog(page, readerExitDialog);
}

async function showReaderHeader(page: Page) {
  const header = readerHeader(page);

  await expect
    .poll(
      async () => {
        if ((await header.getAttribute('inert')) === null) {
          return true;
        }

        await page
          .getByRole('button', { name: 'Show reader header' })
          .click({ timeout: 1_000 })
          .catch(() => {});
        return false;
      },
      { timeout: SYNC_ASSERTION_TIMEOUT }
    )
    .toBe(true);

  return header;
}

function readerHeader(page: Page) {
  return page.locator('[aria-label="Reader controls"][role="toolbar"]');
}

async function readerIsMounted(page: Page) {
  return (await page.getByRole('button', { name: 'Show reader header' }).count()) > 0;
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
