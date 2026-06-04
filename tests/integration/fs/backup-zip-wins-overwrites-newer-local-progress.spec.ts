import { expect, test } from '../helpers/harness.ts';
import {
  bookmarkFixturePartway,
  bookProgressBar,
  expectBookPartwayProgress,
  expectBooksInManage,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import {
  completeCurrentBook,
  exportBackup,
  importBackup,
  signOutAndWipe
} from '../helpers/workflows.ts';

test('backup import with "ZIP wins" overwrites newer local progress', async ({
  page
}, testInfo) => {
  const backupPath = testInfo.outputPath('progress-backup.zip');

  await page.clock.install({ time: new Date('2026-05-01T12:00:00Z') });
  await importBookFixtures(page, [LONG_BOOK]);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expectBookPartwayProgress(page, LONG_BOOK);
  await exportBackup(page, backupPath, { allBooks: true, allBookmarks: true });

  await signOutAndWipe(page);
  await page.clock.setSystemTime(new Date('2026-05-02T12:00:00Z'));
  await importBookFixtures(page, [LONG_BOOK]);
  await openBookFromManage(page, LONG_BOOK);
  await completeCurrentBook(page);
  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expect(bookProgressBar(page, LONG_BOOK)).toHaveAttribute('value', '100');

  await importBackup(page, backupPath, { direction: 'ZIP wins' });

  await expectBooksInManage(page, { placeholders: [], downloaded: [LONG_BOOK] });
  await expectBookPartwayProgress(page, LONG_BOOK);
});
