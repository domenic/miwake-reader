import { resolve } from 'node:path';
import type { Locator, Page } from '@playwright/test';
import { expect, test } from './helpers/harness.ts';
import { fixtureTitle, VALID_BOOK } from './helpers/fixtures.ts';
import { loadApp } from './helpers/navigation.ts';

test.use({ viewport: { width: 320, height: 844 } });

test('mobile section headers keep labeled controls visible and expose overflow actions', async ({
  page
}) => {
  await loadApp(page);

  const libraryToolbar = page.getByRole('toolbar', { name: 'Library controls' });
  const libraryActions = libraryToolbar.locator('[data-mobile-actions]');
  const libraryActionLabels = ['Select', 'Import', 'Sort', 'Bug Report'];
  await expectVisibleControls(libraryActions, libraryActionLabels);
  await expectControlsToHaveEqualWidths(libraryActions, libraryActionLabels);
  await expectToolbarToFitViewport(libraryActions, page);

  let navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expectVisibleControls(navigation, ['Statistics', 'Settings', 'Manager']);
  await expectControlsToHaveEqualWidths(navigation, ['Statistics', 'Settings', 'Manager']);
  await expectToolbarToFitViewport(navigation, page);

  await visibleControl(libraryActions, 'Import').click();
  await expect(visibleControl(libraryToolbar, 'Import Files')).toBeVisible();
  await expect(visibleControl(libraryToolbar, 'Import Folder')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(visibleControl(libraryToolbar, 'Import Files')).toBeHidden();

  await visibleControl(navigation, 'Settings').click();
  await page.waitForURL((url) => url.pathname.startsWith('/settings'));

  const settingsToolbar = page.getByRole('toolbar', { name: 'Settings controls' });
  const settingsActions = settingsToolbar.locator('[data-mobile-actions]');
  await expectVisibleControls(settingsActions, ['Reader', 'Sync', 'Statistics']);
  await expectControlsToHaveEqualWidths(settingsActions, ['Reader', 'Sync', 'Statistics']);
  await expectToolbarToFitViewport(settingsActions, page);

  navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await visibleControl(navigation, 'Statistics').click();
  await page.waitForURL((url) => url.pathname === '/statistics');

  const statisticsToolbar = page.getByRole('toolbar', { name: 'Statistics controls' });
  const statisticsActions = statisticsToolbar.locator('[data-mobile-actions]');
  await expectVisibleControls(statisticsActions, ['Summary', 'Heatmap', 'Filter', 'More']);
  await expectControlsToHaveEqualWidths(statisticsActions, [
    'Summary',
    'Heatmap',
    'Filter',
    'More'
  ]);
  await expectToolbarToFitViewport(statisticsActions, page);

  await visibleControl(statisticsToolbar, 'More').click();
  await expect(visibleControl(statisticsToolbar, 'Copy Reading Time')).toBeVisible();
  await expect(visibleControl(statisticsToolbar, 'Copy Characters Read')).toBeVisible();
  await expect(visibleControl(statisticsToolbar, 'Statistics Settings')).toBeVisible();
  await expectToolbarToFitViewport(statisticsActions, page);
});

test('mobile library selection and reader actions use labeled overflow menus', async ({ page }) => {
  await loadApp(page);

  await visibleControl(page.getByRole('toolbar', { name: 'Library controls' }), 'Import').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await visibleControl(
    page.getByRole('toolbar', { name: 'Library controls' }),
    'Import Files'
  ).click();
  const chooser = await chooserPromise;
  await chooser.setFiles(resolve(import.meta.dirname, 'fixtures/books', 'valid-japanese.epub'));

  const title = fixtureTitle(VALID_BOOK);
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  const card = page.locator('article').filter({ hasText: title });
  const cardActions = card.locator('[data-book-card-actions]');
  await expect(
    card.getByRole('link', { name: `View statistics for ${title}`, includeHidden: true })
  ).toBeHidden();
  await expect(card.getByRole('button', { name: `Details for ${title}` })).toBeVisible();
  await expect(card.getByRole('button', { name: `More actions for ${title}` })).toBeVisible();
  await expectElementToFitContainer(cardActions, card);
  await card.getByRole('button', { name: `Details for ${title}` }).click();
  await expectElementToFitViewport(card.locator('[data-book-details]'), page);
  await card.getByRole('button', { name: `Details for ${title}` }).click();

  const libraryToolbar = page.getByRole('toolbar', { name: 'Library controls' });
  const libraryActions = libraryToolbar.locator('[data-mobile-actions]');
  await visibleControl(libraryActions, 'Select').click();
  await card.getByRole('button', { name: title, exact: true }).click();
  await expectVisibleControls(libraryActions, ['Select', 'Clear All', 'Actions']);
  await expectControlsToHaveEqualWidths(libraryActions, ['Select', 'Clear All', 'Actions']);
  await expectToolbarToFitViewport(libraryActions, page);

  await visibleControl(libraryActions, 'Actions').click();
  await expect(visibleControl(libraryToolbar, 'View Statistics')).toBeVisible();
  await expect(visibleControl(libraryToolbar, 'Mark Complete')).toBeVisible();
  await expect(visibleControl(libraryToolbar, 'Delete Statistics')).toBeVisible();
  await expect(visibleControl(libraryToolbar, 'Remove Books')).toBeVisible();

  await visibleControl(libraryActions, 'Select').click();
  await card.getByRole('link', { name: title, exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/b' && url.searchParams.has('t'));

  const readerToolbar = page.getByRole('toolbar', { name: 'Reader controls' });
  if ((await readerToolbar.getAttribute('inert')) !== null) {
    await page.getByRole('button', { name: 'Show reader header' }).click();
  }

  const readerActions = readerToolbar.locator('[data-mobile-actions]');
  await expectVisibleControls(readerActions, ['TOC', 'Bookmark', 'More']);
  await expectControlsToHaveEqualWidths(readerActions, ['TOC', 'Bookmark', 'More']);
  await expectToolbarToFitViewport(readerActions, page);

  const navigationBar = page.locator('[data-mobile-navigation]');
  await visibleControl(readerActions, 'Bookmark').click();
  await expect(readerToolbar).toHaveAttribute('inert', '');
  await expect(navigationBar).toHaveAttribute('inert', '');
  await page.getByRole('button', { name: 'Show reader header' }).click();
  await expect(readerToolbar).not.toHaveAttribute('inert', '');
  await expect(navigationBar).not.toHaveAttribute('inert', '');
  await expectVisibleControls(readerActions, ['TOC', 'Bookmark', 'Return', 'More']);
  await expectControlsToHaveEqualWidths(readerActions, ['TOC', 'Bookmark', 'Return', 'More']);
  await expectToolbarToFitViewport(readerActions, page);

  const navigation = page.getByRole('navigation', { name: 'Primary navigation' });
  await expectVisibleControls(navigation, ['Book', 'Statistics', 'Settings', 'Manager']);
  await expectControlsToHaveEqualWidths(navigation, ['Book', 'Statistics', 'Settings', 'Manager']);
  await expectToolbarToFitViewport(navigation, page);

  await visibleControl(readerActions, 'More').click();
  await expect(visibleControl(readerToolbar, 'Complete Book')).toBeVisible();
  await expect(visibleControl(readerToolbar, 'Fullscreen')).toBeVisible();
  await expect(visibleControl(readerToolbar, 'Jump to Character')).toBeVisible();
  await expect(visibleControl(readerToolbar, 'Set Point')).toBeVisible();
});

test('mobile navigation is unavailable while a library operation is in progress', async ({
  page
}) => {
  await loadApp(page);

  const libraryToolbar = page.getByRole('toolbar', { name: 'Library controls' });
  await visibleControl(libraryToolbar, 'Import').click();
  const chooserPromise = page.waitForEvent('filechooser');
  await visibleControl(libraryToolbar, 'Import Files').click();
  const chooser = await chooserPromise;
  const booksDirectory = resolve(import.meta.dirname, 'fixtures/books');
  await chooser.setFiles([
    resolve(booksDirectory, 'cover-refresh-book.epub'),
    resolve(booksDirectory, 'long-test-book.epub'),
    resolve(booksDirectory, 'plain-text-book.txt'),
    ...Array<string>(8).fill(resolve(booksDirectory, 'long-test-book.epub'))
  ]);

  const navigation = page.locator('[data-mobile-navigation]');
  await expect(page.getByTitle('Cancel operation')).toBeVisible();
  await expect(navigation).toHaveAttribute('inert', '');
  await expect(navigation).toHaveCSS('opacity', '0');

  await expect(page.getByTitle('Cancel operation')).toBeHidden();
  await expect(navigation).not.toHaveAttribute('inert', '');
  await expect(navigation).toHaveCSS('opacity', '1');
});

async function expectVisibleControls(toolbar: Locator, labels: string[]) {
  for (const label of labels) {
    await expect(visibleControl(toolbar, label)).toBeVisible();
  }
}

async function expectControlsToHaveEqualWidths(toolbar: Locator, labels: string[]) {
  const widths = await Promise.all(
    labels.map((label) =>
      visibleControl(toolbar, label).evaluate((control) => control.getBoundingClientRect().width)
    )
  );
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
}

function visibleControl(toolbar: Locator, label: string) {
  return toolbar
    .getByRole('button', { name: label, exact: true })
    .or(toolbar.getByRole('link', { name: label, exact: true }))
    .filter({ visible: true });
}

async function expectToolbarToFitViewport(toolbar: Locator, page: Page) {
  const viewportWidth = page.viewportSize()?.width;
  expect(viewportWidth).toBeDefined();

  const controlBoxes = await toolbar.locator('button:visible, a:visible').evaluateAll((controls) =>
    controls.map((control) => {
      const { left, right } = control.getBoundingClientRect();
      return { left, right };
    })
  );

  expect(controlBoxes.length).toBeGreaterThan(0);
  for (const box of controlBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewportWidth!);
  }
}

async function expectElementToFitContainer(element: Locator, container: Locator) {
  const { clientWidth, scrollWidth } = await element.evaluate((node) => ({
    clientWidth: node.clientWidth,
    scrollWidth: node.scrollWidth
  }));
  const elementBox = await element.boundingBox();
  const containerBox = await container.boundingBox();
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
  expect(elementBox).not.toBeNull();
  expect(containerBox).not.toBeNull();
  expect(elementBox!.x).toBeGreaterThanOrEqual(containerBox!.x);
  expect(elementBox!.x + elementBox!.width).toBeLessThanOrEqual(
    containerBox!.x + containerBox!.width
  );
}

async function expectElementToFitViewport(element: Locator, page: Page) {
  await expect(element).toBeVisible();
  const viewportWidth = page.viewportSize()?.width;
  expect(viewportWidth).toBeDefined();
  const { left, right, clientWidth, scrollWidth } = await element.evaluate((node) => {
    const bounds = node.getBoundingClientRect();
    return {
      left: bounds.left,
      right: bounds.right,
      clientWidth: node.clientWidth,
      scrollWidth: node.scrollWidth
    };
  });
  expect(left).toBeGreaterThanOrEqual(0);
  expect(right).toBeLessThanOrEqual(viewportWidth!);
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
