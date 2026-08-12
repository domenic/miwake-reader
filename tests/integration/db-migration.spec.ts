import { expect, test } from './helpers/harness.ts';
import { plantLegacyV7Database } from './helpers/legacy-database.ts';
import { loadApp } from './helpers/navigation.ts';

const KEPT_TITLE = '移行テストの本';
const DUPLICATE_TITLE = '重複タイトルの本';

test('a v7 database migrates to title-keyed bookmarks and lastItem', async ({ page, context }) => {
  await plantLegacyV7Database(context, {
    books: [
      {
        id: 1,
        title: KEPT_TITLE,
        elementHtml: '<p>migrated reader content</p>',
        characters: 100,
        lastBookOpen: 500
      },
      // Duplicate-title pair — only possible in libraries migrated from the
      // pre-v3 localForage era. Id 3 was opened more recently and must win.
      { id: 2, title: DUPLICATE_TITLE, elementHtml: '<p>older duplicate</p>', lastBookOpen: 100 },
      { id: 3, title: DUPLICATE_TITLE, elementHtml: '<p>newer duplicate</p>', lastBookOpen: 200 }
    ],
    bookmarks: [
      // The newest bookmark of the duplicate pair must survive the collapse.
      { dataId: 2, progress: 0.25, lastBookmarkModified: 100 },
      { dataId: 3, progress: 0.5, lastBookmarkModified: 200 },
      // An orphaned bookmark (no matching book row) must be dropped without
      // aborting the upgrade.
      { dataId: 99, progress: 0.75, lastBookmarkModified: 300 }
    ],
    lastItem: { dataId: 1 }
  });

  await loadApp(page);

  // The duplicate pair collapsed into one card carrying the newest
  // bookmark's progress.
  await expect(page.getByText(DUPLICATE_TITLE, { exact: true })).toHaveCount(1);
  await expect(
    page
      .locator('article')
      .filter({ has: page.getByText(DUPLICATE_TITLE, { exact: true }) })
      .getByRole('progressbar', { name: /Reading progress/ })
  ).toHaveAttribute('value', '50');

  // `lastItem` was re-keyed by title: the root route resumes the kept book.
  await page.goto('/');
  await expect(page).toHaveURL(`/b?${new URLSearchParams({ t: KEPT_TITLE })}`);
  await expect(page.getByText('migrated reader content')).toBeVisible();
});
