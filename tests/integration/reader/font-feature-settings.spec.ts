import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

test('reader applies font feature settings only in vertical writing mode', async ({ page }) => {
  await useReaderSettings(page, {
    fontVPAL: 'On',
    verticalTextOrientation: 'Upright',
    viewMode: 'Continuous',
    writingMode: 'Vertical'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expectBookContentStyles(page, {
    fontFeatureSettings: '"vpal"',
    fontKerning: 'normal',
    textOrientation: 'upright'
  });

  await useReaderSettings(page, { writingMode: 'Horizontal' });
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expectBookContentStyles(page, {
    fontFeatureSettings: '',
    fontKerning: 'normal',
    textOrientation: ''
  });
});

async function expectBookContentStyles(
  page: Page,
  expected: { fontFeatureSettings: string; fontKerning: string; textOrientation: string }
) {
  await expect.poll(() => bookContentStyles(page)).toEqual(expected);
}

function bookContentStyles(page: Page) {
  return page.locator('.book-content').evaluate((el) => {
    const content = el as HTMLElement;
    return {
      fontFeatureSettings: content.style.fontFeatureSettings,
      fontKerning: content.style.fontKerning,
      textOrientation: content.style.textOrientation
    };
  });
}
