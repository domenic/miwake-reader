import { expect, test } from '../helpers/harness.ts';
import {
  expectBookReaderText,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { enableStatistics, useReaderSettings } from '../helpers/workflows.ts';

test('reader autostarts the tracker after page activity settles', async ({ page }) => {
  await enableStatistics(page);
  const autoStartSection = page.locator('section').filter({
    has: page.getByRole('heading', { name: 'Autostart tracker (sec)' })
  });
  const autoStartInput = autoStartSection.getByRole('spinbutton');
  await autoStartInput.fill('1');
  await autoStartInput.blur();

  await useReaderSettings(page, {
    viewMode: 'Continuous',
    writingMode: 'Horizontal'
  });
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);

  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible();
  await page.mouse.wheel(0, 1_000);
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible({
    timeout: 4_000
  });
});
