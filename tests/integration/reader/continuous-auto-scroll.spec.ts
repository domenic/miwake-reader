import { expect, test } from '../helpers/harness.ts';
import type { Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  longBookChapterStartCharacter,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { openTOC, pressReaderShortcut, showReaderHeader } from '../helpers/reader.ts';
import { useReaderSettings, enableStatistics } from '../helpers/workflows.ts';

test('continuous reader auto-scroll starts and stops from the keyboard shortcut', async ({
  page
}) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const startingScrollY = await scrollY(page);
  await pressReaderShortcut(page, 'Space');
  await expect.poll(() => scrollY(page)).toBeGreaterThan(startingScrollY + 50);

  await pressReaderShortcut(page, 'Space');
  const stoppedScrollY = await scrollY(page);
  await expectScrollToStayStopped(page, stoppedScrollY);
});

test('continuous reader page shortcuts scroll forward and back', async ({ page }) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await page.mouse.wheel(0, 1_000);
  const scrolledY = await expectScrollYChangedFrom(page, 0);

  await pressReaderShortcut(page, 'PageUp');
  const afterPageUpScrollY = await expectScrollYLessThan(page, scrolledY - 50);

  await pressReaderShortcut(page, 'PageDown');
  await expect.poll(() => scrollY(page)).toBeGreaterThan(afterPageUpScrollY + 50);
});

test('continuous reader keyboard shortcuts adjust auto-scroll speed', async ({ page }) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await pressReaderShortcut(page, 'Shift+A');
  const header = await showReaderHeader(page);
  await expect(header.getByTitle('Current autoscroll speed')).toHaveText('20x');

  await pressReaderShortcut(page, 'a');
  await expect(header.getByTitle('Current autoscroll speed')).toHaveText('21x');

  await pressReaderShortcut(page, 'd');
  await expect(header.getByTitle('Current autoscroll speed')).toHaveText('20x');
});

test('continuous reader shows auto-scroll tracker statistics while auto-scrolling', async ({
  page
}) => {
  await enableStatistics(page);
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await pressReaderShortcut(page, 'Space');
  await expect.poll(() => scrollY(page)).toBeGreaterThan(50);
  await page.getByRole('button', { name: 'Open reading statistics' }).click();

  const autoscrollerSection = page.getByRole('region', { name: 'Autoscroller' });
  await expect(autoscrollerSection).toBeVisible();
  await expect(autoscrollerSection).toContainText(/Reading Time:\s*(?!00:00:00)\d{2}:\d{2}:\d{2}/);
});

test('continuous reader auto-bookmarks after scrolling stops', async ({ page }) => {
  await useContinuousReader(page, { autoBookmark: 'On', autoBookmarkTime: '1' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expect(page.getByRole('button', { name: 'Return to Bookmark' })).toHaveCount(0);

  await page.mouse.wheel(0, 1_000);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(100);

  await page.mouse.wheel(0, 1_000);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(500);

  const header = await showReaderHeader(page);
  const returnToBookmark = header.getByRole('button', { name: 'Return to Bookmark' });
  await expect(returnToBookmark).toBeVisible();
});

test('continuous reader bookmark shortcuts create and return to a bookmark', async ({ page }) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expect(page.getByRole('button', { name: 'Return to Bookmark' })).toHaveCount(0);

  await pressReaderShortcut(page, 'Shift+B');
  await expect(page.getByRole('button', { name: 'Return to Bookmark' })).toHaveCount(0);

  await page.mouse.wheel(0, 1_000);
  const bookmarkedScrollY = await expectScrollYChangedFrom(page, 0);

  await pressReaderShortcut(page, 'b');

  const header = await showReaderHeader(page);
  await expect(header.getByRole('button', { name: 'Return to Bookmark' })).toBeVisible();

  await page.mouse.wheel(0, 1_000);
  await expectScrollYChangedFrom(page, bookmarkedScrollY);

  await pressReaderShortcut(page, 'r');
  await expect.poll(() => scrollY(page)).toBe(bookmarkedScrollY);
});

test('reader shortcuts are ignored while the table of contents is open', async ({ page }) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await openTOC(page);
  await pressReaderShortcut(page, 'b');
  await page.getByTitle('Close table of contents').click();

  const header = await showReaderHeader(page);
  await expect(header.getByRole('button', { name: 'Return to Bookmark' })).toHaveCount(0);
});

test('reader shortcuts are ignored while the jump dialog is open', async ({ page }) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: 'Jump' }).click();

  const dialog = page.getByRole('dialog', { name: 'Jump to character' });
  await dialog.getByLabel('Character position').focus();
  await page.keyboard.press('b');
  await dialog.getByRole('button', { name: 'Cancel' }).click();

  await expect(header.getByRole('button', { name: 'Return to Bookmark' })).toHaveCount(0);
});

test('pressing Enter in the jump dialog jumps to the entered character', async ({ page }) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const initialScrollY = await scrollY(page);
  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: 'Jump' }).click();

  const dialog = page.getByRole('dialog', { name: 'Jump to character' });
  const characterPosition = dialog.getByLabel('Character position');
  await characterPosition.fill(String(longBookChapterStartCharacter(4)));
  await characterPosition.press('Enter');

  await expect(dialog).toHaveCount(0);
  await expect.poll(() => scrollY(page)).toBeGreaterThan(initialScrollY + 1_000);
});

test('continuous reader tracker toggle shortcut pauses and resumes tracking', async ({ page }) => {
  await enableStatistics(page);
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible();

  await pressReaderShortcut(page, 'Shift+P');
  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible();

  await pressReaderShortcut(page, 'p');
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible();

  await pressReaderShortcut(page, 'p');
  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible();
});

test('continuous reader tracker freeze shortcut freezes the current position', async ({ page }) => {
  await enableStatistics(page);
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await pressReaderShortcut(page, 'f');
  await page.getByRole('button', { name: 'Open reading statistics' }).click();
  await expect(page.getByText('Frozen Position')).toBeVisible();
});

test.describe('touch devices', () => {
  test.use({ hasTouch: true, viewport: { width: 900, height: 700 } });

  test('continuous reader hides the desktop auto-scroll multiplier', async ({ page }) => {
    await useContinuousReader(page);
    await importBookFixtures(page, [LONG_BOOK]);
    await openBookFromManage(page, LONG_BOOK);
    await expectBookReaderText(page, LONG_BOOK);

    const header = await showReaderHeader(page);
    await expect(header.getByText('20x', { exact: true })).toHaveCount(0);
  });
});

async function useContinuousReader(
  page: Page,
  settings: { autoBookmark?: string; autoBookmarkTime?: string } = {}
) {
  await useReaderSettings(page, {
    ...settings,
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
}

function scrollY(page: Page) {
  return page.evaluate(() => window.scrollY);
}

async function expectScrollYChangedFrom(page: Page, startingScrollY: number) {
  await expect.poll(() => scrollY(page)).toBeGreaterThan(startingScrollY);
  return scrollY(page);
}

async function expectScrollYLessThan(page: Page, targetScrollY: number) {
  await expect.poll(() => scrollY(page)).toBeLessThan(targetScrollY);
  return scrollY(page);
}

async function expectScrollToStayStopped(page: Page, stoppedScrollY: number) {
  // A direct `expect.poll(...).toBeLessThanOrEqual()` would pass immediately; this samples across
  // a short window so a still-running auto-scroller has time to move the page.
  const maxScrollYDuringObservationWindow = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const endTime = performance.now() + 750;
        let maxScrollY = window.scrollY;

        const sampleScrollY = () => {
          maxScrollY = Math.max(maxScrollY, window.scrollY);

          if (performance.now() >= endTime) {
            resolve(maxScrollY);
            return;
          }

          requestAnimationFrame(sampleScrollY);
        };

        requestAnimationFrame(sampleScrollY);
      })
  );

  expect(maxScrollYDuringObservationWindow).toBeLessThanOrEqual(stoppedScrollY + 2);
}
