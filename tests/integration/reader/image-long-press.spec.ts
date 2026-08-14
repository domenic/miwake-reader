import type { Locator, Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import { openBookFromManage, SPOILER_IMAGE_GALLERY_BOOK } from '../helpers/fixtures.ts';
import {
  readerImage,
  readerImageURL,
  readerSVGImage,
  readerSVGImageURL
} from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';
import { openSpoilerFixtureBook } from './spoiler-fixture.ts';

const COVER_ALT = 'Cover before spoilers';
const SVG_LABEL = 'SVG before spoilers';
const SPOILER_ONE_ALT = 'Spoiler illustration one';

test('normal images do not get long-press open behavior outside PWA display mode', async ({
  page
}) => {
  await page.clock.install();
  await openSpoilerFixtureBook(page);

  const coverImage = readerImage(page, COVER_ALT);
  await expectLongPressNotToOpen(page, coverImage);
});

test('normal images get long-press open behavior in PWA display mode', async ({ page }) => {
  await page.clock.install();
  await page.addInitScript(emulatePWADisplayMode);
  await openSpoilerFixtureBook(page);

  await expectLongPressToOpen(
    page,
    readerImage(page, COVER_ALT),
    await readerImageURL(page, COVER_ALT)
  );
});

test('SVG images always get long-press open behavior', async ({ page }) => {
  await page.clock.install();
  await openSpoilerFixtureBook(page);

  await expectLongPressToOpen(
    page,
    readerSVGImage(page, SVG_LABEL),
    await readerSVGImageURL(page, SVG_LABEL)
  );
});

test('long-press open cancels on pointer movement and pointer cancellation', async ({ page }) => {
  await page.clock.install();
  await openSpoilerFixtureBook(page);

  const svgImage = readerSVGImage(page, SVG_LABEL);
  await expectMovedLongPressNotToOpen(page, svgImage);
  await expectPointerCancelNotToOpen(page, svgImage);
});

test('spoiler image long-press follows the blur image setting and reveal state', async ({
  page
}) => {
  await page.clock.install();
  await page.addInitScript(emulatePWADisplayMode);
  await openSpoilerFixtureBook(page, { blurImages: 'After ToC' });

  const hiddenSpoilerImage = readerImage(page, SPOILER_ONE_ALT);
  await expectLongPressNotToOpen(page, hiddenSpoilerImage);

  await revealReaderImageIfNeeded(page, SPOILER_ONE_ALT);
  await expectLongPressToOpen(
    page,
    readerImage(page, SPOILER_ONE_ALT),
    await readerImageURL(page, SPOILER_ONE_ALT)
  );

  await useReaderSettings(page, { blurImages: 'Off' });
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);

  await expectLongPressToOpen(
    page,
    readerImage(page, SPOILER_ONE_ALT),
    await readerImageURL(page, SPOILER_ONE_ALT)
  );
});

async function expectLongPressToOpen(page: Page, locator: Locator, expectedURL: string) {
  const center = await moveMouseToCenter(page, locator);

  await page.mouse.down();
  await page.clock.runFor(1_100);

  const popupPromise = page.waitForEvent('popup');
  await page.mouse.up();
  const popup = await popupPromise;

  await expect(popup).toHaveURL(expectedURL);
  await popup.close();

  return center;
}

async function expectLongPressNotToOpen(page: Page, locator: Locator) {
  await moveMouseToCenter(page, locator);

  await page.mouse.down();
  await page.clock.runFor(1_100);

  await expectNoPopupFrom(page, () => page.mouse.up());
}

async function expectMovedLongPressNotToOpen(page: Page, locator: Locator) {
  const { x, y } = await moveMouseToCenter(page, locator);

  await page.mouse.down();
  await page.clock.runFor(300);
  await page.mouse.move(x + 10, y + 10);
  await page.clock.runFor(900);

  await expectNoPopupFrom(page, () => page.mouse.up());
}

async function expectPointerCancelNotToOpen(page: Page, locator: Locator) {
  await moveMouseToCenter(page, locator);

  await page.mouse.down();
  await page.clock.runFor(300);

  await expectNoPopupFrom(page, () =>
    page.evaluate(() => {
      window.dispatchEvent(new PointerEvent('pointercancel'));
    })
  );
  await page.clock.runFor(900);
  await page.mouse.up();
}

async function expectNoPopupFrom(page: Page, action: () => Promise<void>) {
  const popupPromise = page.waitForEvent('popup', { timeout: 500 }).catch(() => undefined);
  await action();

  const popup = await popupPromise;
  await popup?.close();
  expect(popup).toBeUndefined();
}

async function moveMouseToCenter(page: Page, locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error('Expected long-press target to have a bounding box');
  }

  const center = {
    x: box.x + box.width / 2,
    y: box.y + box.height / 2
  };
  await page.mouse.move(center.x, center.y);
  return center;
}

function readerSpoilerWrapper(page: Page, imageAlt: string) {
  return page.locator('.book-content [data-miwake-spoiler-img]').filter({
    has: page.locator(`img[alt="${imageAlt}"]`)
  });
}

async function revealReaderImageIfNeeded(page: Page, imageAlt: string) {
  const wrapper = readerSpoilerWrapper(page, imageAlt);
  if ((await wrapper.count()) > 0) {
    await wrapper.click({ force: true });
  }

  await expect(wrapper).toHaveCount(0);
  await expect(readerImage(page, imageAlt)).toHaveClass(/ttu-unspoilered/);
}

function emulatePWADisplayMode() {
  const nativeMatchMedia = window.matchMedia.bind(window);
  const fullscreenPWADisplayMode = '(display-mode: fullscreen)';

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value(query: string) {
      if (query !== fullscreenPWADisplayMode) {
        return nativeMatchMedia(query);
      }

      return {
        matches: true,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true
      };
    }
  });
}
