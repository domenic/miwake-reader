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
