import { bookFixturePath, expect, importFiles, test } from '../helpers/harness.ts';

const invalidBookFixtures = [
  { description: 'text file with an EPUB extension', filename: 'not-a-zip.epub' },
  { description: 'ZIP file missing EPUB structure', filename: 'not-an-epub.epub' }
];

for (const { description, filename } of invalidBookFixtures) {
  test(`importing ${description} surfaces the import-failed dialog`, async ({ page }) => {
    await page.goto('/manage');
    await importFiles(page, bookFixturePath(filename));

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toContainText('Book Import Failed');
    await expect(dialog).toContainText(filename);
  });
}
