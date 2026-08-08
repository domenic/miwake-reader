import { expect, test } from '@playwright/test';
import { fixtureTitle, importBookFixtures, VALID_BOOK } from '../helpers/fixtures.ts';

test('import preserves EPUB creator metadata on the book record', async ({ page }) => {
  await importBookFixtures(page, [VALID_BOOK]);

  const author = await page.evaluate(async (title) => {
    const databaseRequest = indexedDB.open('books');
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      databaseRequest.addEventListener('success', () => resolve(databaseRequest.result));
      databaseRequest.addEventListener('error', () => reject(databaseRequest.error));
    });
    const transaction = database.transaction('data', 'readonly');
    const bookRequest = transaction.objectStore('data').index('title').get(title);
    const book = await new Promise<{ author?: string } | undefined>((resolve, reject) => {
      bookRequest.addEventListener('success', () => resolve(bookRequest.result));
      bookRequest.addEventListener('error', () => reject(bookRequest.error));
    });
    database.close();
    return book?.author;
  }, fixtureTitle(VALID_BOOK));

  expect(author).toBe('テスト 太郎');
});
