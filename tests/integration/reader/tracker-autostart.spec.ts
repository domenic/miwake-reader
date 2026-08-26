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
  await page
    .getByRole('group', { name: 'Start tracking' })
    .getByLabel('Automatically', { exact: false })
    .check();
  const autoStartInput = page.getByLabel('Start after');
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
