import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import {
  importBookFixtures,
  openBookFromManage,
  SPOILER_IMAGE_GALLERY_BOOK
} from '../helpers/fixtures.ts';
import { useReaderSettings } from '../helpers/workflows.ts';
import { openSpoilerFixtureBook } from './spoiler-fixture.ts';

test('book content enhancement wires generated anchors and ruby clicks', async ({ page }) => {
  await openSpoilerFixtureBook(page, {
    furigana: 'Toggle',
    writingMode: 'Horizontal'
  });

  await page.getByRole('link', { name: 'Ruby sample' }).click();

  const rubySample = page.locator('#ruby-sample');
  await expect(rubySample).toBeInViewport();

  const ruby = rubySample.locator('ruby');
  const rubyText = ruby.locator('rt');
  await expect(rubyText).toBeHidden();

  await ruby.hover();
  await expect(rubyText).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(rubyText).toBeHidden();

  await ruby.dispatchEvent('click');
  await expect(rubyText).toBeVisible();
  await ruby.dispatchEvent('click');
  await expect(rubyText).toBeHidden();
});

test('furigana setting changes update ruby click behavior after reopening the reader', async ({
  page
}) => {
  await useReaderSettings(page, {
    furigana: 'Default',
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [SPOILER_IMAGE_GALLERY_BOOK]);
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);
  await openRubySample(page);

  const defaultRuby = page.locator('#ruby-sample ruby');
  const defaultRubyText = defaultRuby.locator('rt');
  await expect(defaultRubyText).toBeVisible();
  await defaultRuby.dispatchEvent('click');
  await expect(defaultRubyText).toBeVisible();

  await useReaderSettings(page, { furigana: 'Toggle' });
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);
  await openRubySample(page);

  const toggleRuby = page.locator('#ruby-sample ruby');
  const toggleRubyText = toggleRuby.locator('rt');
  await expect(toggleRubyText).toBeHidden();
  await toggleRuby.dispatchEvent('click');
  await expect(toggleRubyText).toBeVisible();
});

async function openRubySample(page: Page) {
  await page.getByRole('link', { name: 'Ruby sample' }).click();
  await expect(page.locator('#ruby-sample')).toBeInViewport();
}
