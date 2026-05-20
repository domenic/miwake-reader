import { resolve } from 'node:path';
import { expect, test } from '../helpers/harness.ts';

const cases = [
  { label: 'plain text masquerading as an .epub', file: 'not-a-zip.epub' },
  { label: 'zip without EPUB structure', file: 'not-an-epub.epub' }
];

for (const { label, file } of cases) {
  test(`importing ${label} surfaces the import-failed dialog`, async ({ page }) => {
    await page.goto('/manage');
    // Wait for Svelte to hydrate before driving the hidden file input — its `use:inputFile`
    // directive attaches the change listener on mount, and setInputFiles fired earlier just
    // dispatches a change event into the void.
    await expect(page.getByText('Drop files here or click to upload')).toBeVisible();

    await page
      .locator('input[accept*="epub"]')
      .first()
      .setInputFiles(resolve(import.meta.dirname, `../fixtures/books/${file}`));

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toContainText('Book Import Failed');
    await expect(dialog).toContainText(file);
  });
}
