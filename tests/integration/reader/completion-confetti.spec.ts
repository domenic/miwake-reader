import { expect, test } from '../helpers/harness.ts';
import {
  COVER_REFRESH_BOOK,
  expectBookReaderText,
  importBookFixtures,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { completeCurrentBook } from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

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
