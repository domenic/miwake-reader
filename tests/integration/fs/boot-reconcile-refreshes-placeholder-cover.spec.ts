import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import {
  COVER_REFRESH_BOOK,
  expectBooksInManage,
  replaceBookCoverInSyncRoot,
  bookCard
} from '../helpers/fixtures.ts';
import { coverBitmapBytes, type RGBColor } from '../fixtures/cover-bitmap.ts';
import {
  connectFS,
  signOutAndWipe,
  syncBookFixturesToSource,
  waitForSyncIdle
} from '../helpers/workflows.ts';
import { navigateToManage } from '../helpers/navigation.ts';

const RED_COVER = { red: 255, green: 0, blue: 0 };
const BLUE_COVER = { red: 0, green: 0, blue: 255 };

test('boot reconcile refreshes a placeholder cover changed in the sync source', async ({
  page
}) => {
  await syncBookFixturesToSource(page, [COVER_REFRESH_BOOK]);
  await expectBookCoverColor(page, RED_COVER);

  await signOutAndWipe(page);
  await connectFS(page);
  await expectBooksInManage(page, { placeholders: [COVER_REFRESH_BOOK], downloaded: [] });
  await expectBookCoverColor(page, RED_COVER);

  await replaceBookCoverInSyncRoot(page, COVER_REFRESH_BOOK, coverBitmapBytes(BLUE_COVER));
  await page.reload();
  await waitForSyncIdle(page);

  await expectBooksInManage(page, { placeholders: [COVER_REFRESH_BOOK], downloaded: [] });
  await expectBookCoverColor(page, BLUE_COVER);
});

async function expectBookCoverColor(page: Page, expected: RGBColor) {
  await navigateToManage(page);
  const cover = bookCard(page, COVER_REFRESH_BOOK).locator('img.book-cover');
  await expect(cover).toBeVisible();
  await expect.poll(() => sampleImageColor(cover)).toEqual(expected);
}

async function sampleImageColor(cover: Locator): Promise<RGBColor> {
  return cover.evaluate(async (element) => {
    const image = element as HTMLImageElement;
    image.loading = 'eager';

    if (!image.complete) {
      await new Promise<void>((resolve) => {
        image.addEventListener('load', () => resolve(), { once: true });
        image.addEventListener('error', () => resolve(), { once: true });
      });
    }

    if (!image.naturalWidth || !image.naturalHeight) {
      throw new Error('Cover image did not decode');
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to read cover image with canvas');
    }

    context.drawImage(image, 0, 0);
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data;
    return { red, green, blue };
  });
}
