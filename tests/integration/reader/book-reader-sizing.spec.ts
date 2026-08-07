import { expect, test } from '../helpers/harness.ts';
import type { Locator, Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  MEDIA_SIZING_BOOK,
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

for (const viewMode of ['Continuous', 'Paginated']) {
  for (const writingMode of ['Horizontal', 'Vertical']) {
    test(`${viewMode.toLowerCase()} ${writingMode.toLowerCase()} reader contains oversized media without resizing inline glyphs`, async ({
      page
    }) => {
      await page.setViewportSize({ width: 1_000, height: 700 });
      await useReaderSettings(page, {
        fontSize: '20',
        theme: 'light-theme',
        viewMode,
        writingMode
      });
      await importBookFixtures(page, [MEDIA_SIZING_BOOK]);
      await openBookFromManage(page, MEDIA_SIZING_BOOK);
      await expectBookReaderText(page, MEDIA_SIZING_BOOK);

      const illustration = page.getByAltText('Oversized portrait illustration');
      await expect(illustration).toHaveCSS('object-fit', 'contain');
      await expect
        .poll(() => mediaDimensions(illustration))
        .toMatchObject({ complete: true, naturalHeight: 128, naturalWidth: 87 });

      const illustrationDimensions = await mediaDimensions(illustration);
      expect(illustrationDimensions.width).toBeLessThanOrEqual(1_000);
      expect(illustrationDimensions.height).toBeLessThanOrEqual(700);

      await expect
        .poll(() => mediaDimensions(page.getByAltText('Inline glyph')))
        .toMatchObject({
          complete: true,
          height: 20,
          naturalHeight: 16,
          naturalWidth: 16,
          width: 20
        });
    });
  }
}

async function expectBookContentWidth(page: Page, width: number) {
  await expect
    .poll(async () => {
      const boundingBox = await page.locator('.book-content').boundingBox();
      return Math.round(boundingBox?.width ?? 0);
    })
    .toBe(width);
}

function mediaDimensions(locator: Locator) {
  return locator.evaluate((element) => {
    const image = element as HTMLImageElement;
    const bounds = image.getBoundingClientRect();
    return {
      complete: image.complete,
      height: bounds.height,
      naturalHeight: image.naturalHeight,
      naturalWidth: image.naturalWidth,
      width: bounds.width
    };
  });
}
