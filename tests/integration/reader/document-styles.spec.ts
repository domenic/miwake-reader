import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { showReaderHeader } from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

test('reader applies document styles while mounted and cleans them up on exit', async ({
  page
}) => {
  await useReaderSettings(page, {
    fontSize: '24',
    lineHeight: '1.8',
    theme: 'dark-theme',
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await page.reload();
  await importBookFixtures(page, [LONG_BOOK]);

  await expectDocumentReaderStyles(page, { backgroundColor: '', writingMode: '' });

  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);
  await expectDocumentReaderStyles(page, {
    backgroundColor: 'rgb(18, 18, 18)',
    writingMode: 'horizontal-tb'
  });
  await expectBookContentStyles(page, {
    fontSize: '24px',
    lineHeight: '1.8'
  });

  const header = await showReaderHeader(page);
  await header.getByRole('button', { name: 'Manager', exact: true }).click();

  await expectDocumentReaderStyles(page, { backgroundColor: '', writingMode: '' });
});

test('reader reacts to settings changed in another tab', async ({ page }) => {
  await useReaderSettings(page, {
    theme: 'light-theme',
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);
  await expectDocumentReaderStyles(page, {
    backgroundColor: 'rgb(255, 255, 255)',
    writingMode: 'horizontal-tb'
  });

  const settingsPage = await page.context().newPage();
  try {
    await useReaderSettings(settingsPage, {
      theme: 'dark-theme',
      writingMode: 'Vertical'
    });

    await expectDocumentReaderStyles(page, {
      backgroundColor: 'rgb(18, 18, 18)',
      writingMode: 'vertical-rl'
    });
  } finally {
    await settingsPage.close();
  }
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
  expected: { fontSize: string; lineHeight: string }
) {
  await expect.poll(() => bookContentStyles(page)).toEqual(expected);
}

function bookContentStyles(page: Page) {
  return page.locator('.book-content').evaluate((el) => {
    const content = el as HTMLElement;
    return {
      fontSize: content.style.fontSize,
      lineHeight: content.style.lineHeight
    };
  });
}
