import { expect, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { showReaderHeader } from '../helpers/reader.ts';
import { useReaderSettings } from '../helpers/workflows.ts';

test('continuous reader lets users set and show a custom reading point', async ({ page }) => {
  await useReaderSettings(page, {
    customReadingPoint: 'On',
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await page.keyboard.press('Shift+T');
  await expect(page.locator('body')).not.toHaveClass(/cursor-crosshair/);

  await page.keyboard.press('t');
  await expect(page.locator('body')).toHaveClass(/cursor-crosshair/);

  await page.locator('.book-content').click();
  await expect(page.locator('body')).not.toHaveClass(/cursor-crosshair/);

  const updatedHeader = await showReaderHeader(page);
  await updatedHeader.getByRole('button', { name: /Point/ }).click();
  await page.getByRole('button', { name: 'Show Point', exact: true }).click();
  await expect(page.locator('.border-red-500')).toHaveCount(2);
});
