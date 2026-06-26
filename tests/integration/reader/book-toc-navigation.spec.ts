import { expect, test } from '../helpers/harness.ts';
import type { Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  LONG_BOOK_CHAPTER_CHARACTERS,
  longBookChapterStartCharacter,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { openTOC } from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

test('table of contents navigation jumps to the selected chapter', async ({ page }) => {
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await openTOC(page);
  await page.getByTitle('Go to Chapter 4').click();

  await expectCurrentFooterPage(page).toBeGreaterThan(1_000);
});

test('reader chapter shortcuts navigate between chapters', async ({ page }) => {
  await useReaderSettings(page, {
    viewMode: 'Paginated',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expectCurrentFooterPage(page).toBe(0);

  await page.keyboard.press('Shift+M');
  await expectCurrentFooterPage(page).toBe(0);

  await page.keyboard.press('m');
  await expectCurrentFooterPage(page).toBe(longBookChapterStartCharacter(2));

  await page.keyboard.press('n');
  await expectCurrentFooterPage(page).toBe(0);
});

test('table of contents shows imported chapter bounds and resets progress after navigation', async ({
  page
}) => {
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await openTOC(page);
  await expectTOCChapterProgress(page, { charactersRead: 0, percentage: 0 });
  await expect(chapterRow(page, 'Chapter 4')).toContainText(
    String(longBookChapterStartCharacter(4))
  );

  await page.getByTitle('Go to Chapter 4').click();
  await expectCurrentFooterPage(page).toBeGreaterThan(1_000);

  await openTOC(page);
  await expectTOCChapterProgress(page, { charactersRead: 0, percentage: 0 });
});

test('paginated reader updates chapter progress after page turns', async ({ page }) => {
  await useProgressReaderSettings(page, { tapToFlip: 'On' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await page.getByRole('button', { name: 'Next page' }).click();
  await expectFooterChapterProgress(page, { charactersRead: 7519, percentage: 22.38 });
});

test('continuous reader updates chapter progress after scrolling', async ({ page }) => {
  await useProgressReaderSettings(page, { viewMode: 'Continuous' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await page.mouse.wheel(0, 2_000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  await expectFooterChapterProgress(page, { charactersRead: 8, percentage: 80.59 });
});

test('continuous reader preserves chapter progress after resizing', async ({ page }) => {
  await page.setViewportSize({ width: 1_000, height: 700 });
  await useProgressReaderSettings(page, {
    autoPositionOnResize: 'On',
    viewMode: 'Continuous'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await page.mouse.wheel(0, 2_000);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  const progressBeforeResize = await footerChapterProgressText(page);
  expect(progressBeforeResize).toMatch(/^\d+ \/ \d+ \d+\.\d{2}% C$/);
  expect(progressBeforeResize).not.toBe(
    formatChapterProgress({ charactersRead: 0, percentage: 0 })
  );

  await page.setViewportSize({ width: 700, height: 700 });
  await expect.poll(() => footerChapterProgressText(page)).toBe(progressBeforeResize);
});

function chapterRow(page: Page, chapterLabel: string) {
  return page.getByTitle(`Go to ${chapterLabel}`).locator('xpath=..');
}

async function useProgressReaderSettings(
  page: Page,
  settings: { autoPositionOnResize?: string; tapToFlip?: string; viewMode?: string } = {}
) {
  await useReaderSettings(page, {
    autoPositionOnResize: settings.autoPositionOnResize,
    showFooterChapterCharacters: 'On',
    showFooterChapterPercentage: 'On',
    viewMode: settings.viewMode ?? 'Paginated',
    writingMode: 'Horizontal',
    tapToFlip: settings.tapToFlip
  });
}

function expectCurrentFooterPage(page: Page) {
  return expect.poll(async () => {
    const footerText = await page.locator('#miwake-page-footer').innerText();
    return Number(/(\d+) \/ \d+/.exec(footerText)?.[1] ?? 0);
  });
}

interface ChapterProgress {
  charactersRead: number;
  percentage: number;
}

async function expectTOCChapterProgress(page: Page, progress: ChapterProgress) {
  await expect(
    page.getByText(`Chapter Progress: ${formatChapterProgress(progress, 'toc')}`)
  ).toBeVisible();
}

async function expectFooterChapterProgress(page: Page, progress: ChapterProgress) {
  await expect.poll(() => footerChapterProgressText(page)).toBe(formatChapterProgress(progress));
}

async function footerChapterProgressText(page: Page) {
  return page.locator('#miwake-page-footer span').first().innerText();
}

function formatChapterProgress(
  { charactersRead, percentage }: ChapterProgress,
  location: 'footer' | 'toc' = 'footer'
) {
  const progress = `${charactersRead} / ${LONG_BOOK_CHAPTER_CHARACTERS}`;
  const percentageText = `${percentage.toFixed(2)}%`;

  return location === 'toc' ? `${progress} (${percentageText})` : `${progress} ${percentageText} C`;
}
