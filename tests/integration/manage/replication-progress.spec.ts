import { expect, test } from '../helpers/harness.ts';
import {
  COVER_REFRESH_BOOK,
  expectImportFailedForFixture,
  fixtureTitle,
  INVALID_IMPORT_BOOKS,
  LONG_BOOK,
  PLAIN_TEXT_BOOK,
  startImportBookFixtures,
  type BookFixture
} from '../helpers/fixtures.ts';

test('manager shows replication progress while importing books', async ({ page }) => {
  const fixtures: BookFixture[] = [
    COVER_REFRESH_BOOK,
    LONG_BOOK,
    PLAIN_TEXT_BOOK,
    ...Array<typeof LONG_BOOK>(8).fill(LONG_BOOK)
  ];
  await startImportBookFixtures(page, fixtures);

  const progressHeader = page.getByTitle('Cancel operation');
  const progressBar = progressHeader.getByRole('progressbar');
  await expect(progressBar).toBeVisible();
  await expect(progressBar).toHaveJSProperty('max', fixtures.length * 3);
  await expect
    .poll(() => progressBar.evaluate((el) => (el as HTMLProgressElement).value))
    .toBeGreaterThan(0);
  await expect(progressHeader).toContainText(/~ (?:\d{2}:){2}\d{2}/);

  await expect(
    page.getByRole('link', { name: fixtureTitle(COVER_REFRESH_BOOK), exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: fixtureTitle(LONG_BOOK), exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: fixtureTitle(PLAIN_TEXT_BOOK), exact: true })
  ).toBeVisible();
  await expect(progressHeader).toBeHidden();
});

test('manager advances replication progress when imports fail', async ({ page }) => {
  const [invalidFixture] = INVALID_IMPORT_BOOKS;
  const fixtures = Array<typeof invalidFixture>(8).fill(invalidFixture);

  await startImportBookFixtures(page, fixtures);

  const progressBar = page.getByTitle('Cancel operation').getByRole('progressbar');
  await expect(progressBar).toBeVisible();
  await expect(progressBar).toHaveJSProperty('max', fixtures.length * 3);
  await expect
    .poll(() => progressBar.evaluate((el) => (el as HTMLProgressElement).value))
    .toBeGreaterThan(0);

  await expectImportFailedForFixture(page, invalidFixture);
});
