import type { Page } from '@playwright/test';
import {
  expectBookReaderText,
  importBookFixtures,
  openBookFromManage,
  SPOILER_IMAGE_GALLERY_BOOK
} from '../helpers/fixtures.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

export async function openSpoilerFixtureBook(
  page: Page,
  settings: Parameters<typeof useReaderSettings>[1] = {}
) {
  await useReaderSettings(page, {
    viewMode: 'Continuous',
    ...settings
  });
  await importBookFixtures(page, [SPOILER_IMAGE_GALLERY_BOOK]);
  await openBookFromManage(page, SPOILER_IMAGE_GALLERY_BOOK);
  await expectBookReaderText(page, SPOILER_IMAGE_GALLERY_BOOK);
}
