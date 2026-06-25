import { expect, test } from '../helpers/harness.ts';
import type { Page } from '@playwright/test';
import {
  COVER_REFRESH_BOOK,
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { completeCurrentBook, showReaderHeader } from '../helpers/reader.ts';
import { enableStatistics, useReaderSettings } from '../helpers/workflows.ts';

test('reader applies document styles while mounted and cleans them up on exit', async ({
  page
}) => {
  await useReaderSettings(page, {
    theme: 'dark-theme',
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);

  await expectDocumentReaderStyles(page, { backgroundColor: '', writingMode: '' });

  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);
  await expectDocumentReaderStyles(page, {
    backgroundColor: 'rgb(18, 18, 18)',
    writingMode: 'horizontal-tb'
  });

  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: 'Manager', exact: true }).click();

  await expectDocumentReaderStyles(page, { backgroundColor: '', writingMode: '' });
});

test('reader autostarts the tracker after page activity settles', async ({ page }) => {
  await enableStatistics(page);
  const autoStartSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Autostart tracker (sec)' })
  });
  const autoStartInput = autoStartSection.getByRole('spinbutton');
  await autoStartInput.fill('1');
  await autoStartInput.blur();

  await useReaderSettings(page, {
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible();
  await page.mouse.wheel(0, 1_000);
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible({
    timeout: 4_000
  });
});

test('reader applies font feature settings only in vertical writing mode', async ({ page }) => {
  await useReaderSettings(page, {
    fontVPAL: 'On',
    verticalFontKerning: 'On',
    verticalTextOrientation: 'Upright',
    viewMode: 'Continuous',
    writingMode: 'Vertical'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expectBookContentStyles(page, {
    fontFeatureSettings: '"vkrn", "vpal"',
    textOrientation: 'upright'
  });

  await useReaderSettings(page, { writingMode: 'Horizontal' });
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expectBookContentStyles(page, {
    fontFeatureSettings: '',
    textOrientation: ''
  });
});

test('continuous reader lets users set and show a custom reading point', async ({ page }) => {
  await useReaderSettings(page, {
    customReadingPoint: 'On',
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: /Point/ }).click();
  await page.getByRole('button', { name: 'Set Point', exact: true }).click();
  await expect(page.locator('body')).toHaveClass(/cursor-crosshair/);

  const bookContentBox = await page.locator('.book-content').boundingBox();
  if (!bookContentBox) throw new Error('Expected book content to have a bounding box');
  await page.mouse.click(
    bookContentBox.x + bookContentBox.width / 2,
    bookContentBox.y + bookContentBox.height / 2
  );
  await expect(page.locator('body')).not.toHaveClass(/cursor-crosshair/);

  const updatedHeader = await showReaderHeader(page);
  await updatedHeader.getByRole('button', { name: /Point/ }).click();
  await page.getByRole('button', { name: 'Show Point', exact: true }).click();
  await expect(page.locator('.border-red-500')).toHaveCount(2);
});

test('completion confetti dismisses on pointer interaction', async ({ page }) => {
  await useReaderSettings(page, {
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [COVER_REFRESH_BOOK]);
  await openBookFromManage(page, COVER_REFRESH_BOOK);
  await expectBookReaderText(page, COVER_REFRESH_BOOK);

  await completeCurrentBook(page);
  const confettiCanvas = page.locator('canvas');
  await expect(confettiCanvas).toBeVisible();

  await page.mouse.click(20, 20);
  await expect(confettiCanvas).toHaveCount(0);
});

async function expectDocumentReaderStyles(
  page: Page,
  expected: { backgroundColor: string; writingMode: string }
) {
  await expect.poll(() => documentReaderStyles(page)).toEqual(expected);
}

function documentReaderStyles(page: Page) {
  return page.evaluate(() => ({
    backgroundColor: document.body.style.backgroundColor,
    writingMode: document.documentElement.style.writingMode
  }));
}

async function expectBookContentStyles(
  page: Page,
  expected: { fontFeatureSettings: string; textOrientation: string }
) {
  await expect.poll(() => bookContentStyles(page)).toEqual(expected);
}

function bookContentStyles(page: Page) {
  return page.locator('.book-content').evaluate((el) => {
    const content = el as HTMLElement;
    return {
      fontFeatureSettings: content.style.fontFeatureSettings,
      textOrientation: content.style.textOrientation
    };
  });
}
