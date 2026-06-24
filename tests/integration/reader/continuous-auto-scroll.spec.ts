import { expect, test } from '../helpers/harness.ts';
import type { Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { showReaderHeader } from '../helpers/reader.ts';
import { useReaderSettings, enableStatistics } from '../helpers/workflows.ts';

test('continuous reader auto-scroll starts and stops from the keyboard shortcut', async ({
  page
}) => {
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const startingScrollY = await scrollY(page);
  await page.keyboard.press('Space');
  await expect.poll(() => scrollY(page)).toBeGreaterThan(startingScrollY + 50);

  await page.keyboard.press('Space');
  const stoppedScrollY = await scrollY(page);
  await expectScrollToStayStopped(page, stoppedScrollY);
});

test('continuous reader shows auto-scroll tracker statistics while auto-scrolling', async ({
  page
}) => {
  await enableStatistics(page);
  await useContinuousReader(page);
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await page.keyboard.press('Space');
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
