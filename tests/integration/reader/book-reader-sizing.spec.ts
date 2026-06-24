import { expect, test } from '../helpers/harness.ts';
import type { Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

test('paginated reader content width follows viewport and reader padding', async ({ page }) => {
  await page.setViewportSize({ width: 1_000, height: 700 });
  await useReaderSettings(page, { viewMode: 'Paginated', writingMode: 'Horizontal' });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expectBookContentWidth(page, 936);

  await page.setViewportSize({ width: 700, height: 700 });
  await expectBookContentWidth(page, 668);
});

async function expectBookContentWidth(page: Page, width: number) {
  await expect
    .poll(async () => {
      const boundingBox = await page.locator('.book-content').boundingBox();
      return Math.round(boundingBox?.width ?? 0);
    })
    .toBe(width);
}
