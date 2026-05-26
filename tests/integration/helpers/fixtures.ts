import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import {
  expectSyncRoot,
  listRemoveEntryLog,
  overwriteSyncRootFile,
  removeSyncRootEntry,
  SYNC_ASSERTION_TIMEOUT
} from './harness.ts';

const NOT_A_ZIP_BOOK = 'not-a-zip-book';
const NOT_AN_EPUB_BOOK = 'not-an-epub-book';

export const LONG_BOOK = 'long-book';
export const PLAIN_TEXT_BOOK = 'plain-text-book';
export const VALID_BOOK = 'valid-book';
export const INVALID_IMPORT_BOOKS = [NOT_A_ZIP_BOOK, NOT_AN_EPUB_BOOK] as const;

export type LibraryBookFixture = typeof VALID_BOOK | typeof LONG_BOOK | typeof PLAIN_TEXT_BOOK;
export type InvalidImportBookFixture = typeof NOT_A_ZIP_BOOK | typeof NOT_AN_EPUB_BOOK;
export type BookFixture = LibraryBookFixture | InvalidImportBookFixture;

interface BaseBookFixtureMetadata {
  path: string;
}

interface LibraryBookFixtureMetadata extends BaseBookFixtureMetadata {
  title: string;
  readerText: string;
}

interface InvalidImportBookFixtureMetadata extends BaseBookFixtureMetadata {
  importFailureDescription: string;
  importFailureText: string;
}

type BookFixtureMetadata = LibraryBookFixtureMetadata | InvalidImportBookFixtureMetadata;

const fixtureRoot = resolve(import.meta.dirname, '../fixtures/books');
const fixtureMetadata = new Map<BookFixture, BookFixtureMetadata>([
  [
    VALID_BOOK,
    {
      title: 'テスト用の本',
      path: resolve(fixtureRoot, 'valid-japanese.epub'),
      readerText: 'これはテスト用の第一章の本文です。'
    }
  ],
  [
    LONG_BOOK,
    {
      title: 'Long test book',
      path: resolve(fixtureRoot, 'long-test-book.epub'),
      readerText: 'This is paragraph 1 in chapter 1.'
    }
  ],
  [
    PLAIN_TEXT_BOOK,
    {
      title: 'plain-text-book',
      path: resolve(fixtureRoot, 'plain-text-book.txt'),
      readerText: 'This plain text fixture gives the library another real imported book.'
    }
  ],
  [
    NOT_A_ZIP_BOOK,
    {
      path: resolve(fixtureRoot, 'not-a-zip.epub'),
      importFailureDescription: 'text file with an EPUB extension',
      importFailureText: 'not-a-zip.epub'
    }
  ],
  [
    NOT_AN_EPUB_BOOK,
    {
      path: resolve(fixtureRoot, 'not-an-epub.epub'),
      importFailureDescription: 'ZIP file missing EPUB structure',
      importFailureText: 'not-an-epub.epub'
    }
  ]
]);

export function fixtureDescription(fixture: BookFixture) {
  const metadata = getFixtureMetadata(fixture);
  return 'importFailureDescription' in metadata
    ? metadata.importFailureDescription
    : metadata.title;
}

export async function importBookFixtures(page: Page, fixtures: readonly BookFixture[]) {
  await page.goto('/manage');
  const importButton = page.getByRole('button', { name: 'Import Files' });
  await expect(importButton).toBeVisible();
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), importButton.click()]);
  await fileChooser.setFiles(fixturePaths(fixtures));
  await expectBooksVisible(page, libraryBookFixtures(fixtures));
}

export async function expectBooksVisible(page: Page, fixtures: readonly LibraryBookFixture[]) {
  await Promise.all(
    fixtures.map((fixture) =>
      expect(page.getByText(fixtureTitle(fixture), { exact: true })).toBeVisible({
        timeout: SYNC_ASSERTION_TIMEOUT
      })
    )
  );
}

export async function expectBooksAbsent(page: Page, fixtures: readonly LibraryBookFixture[]) {
  await Promise.all(
    fixtures.map((fixture) =>
      expect(page.getByText(fixtureTitle(fixture), { exact: true })).toHaveCount(0)
    )
  );
}

export async function openBookFromManage(page: Page, fixture: LibraryBookFixture) {
  await page.goto('/manage');
  await page.getByText(fixtureTitle(fixture), { exact: true }).click();
  await page.waitForURL((url) => url.pathname === '/b' && url.searchParams.has('id'));
}

export async function expectBookReaderText(page: Page, fixture: LibraryBookFixture) {
  const { readerText } = getFixtureMetadata(fixture);
  await expect(page.getByText(readerText)).toBeVisible();
}

export async function deleteBookFromManage(page: Page, fixture: LibraryBookFixture) {
  await page.goto('/manage');
  const bookTitle = page.getByText(fixtureTitle(fixture), { exact: true });
  await expect(bookTitle).toBeVisible();

  await page.getByRole('button', { name: 'Select' }).click();
  await bookTitle.click();
  await page.getByRole('button', { name: 'Delete Book' }).click();

  await expect(bookTitle).toHaveCount(0);
}

export function bookProgressBar(page: Page, fixture: LibraryBookFixture) {
  return bookCard(page, fixture).getByRole('progressbar', { name: /Reading progress/ });
}

export async function expectBooksInSyncRoot(page: Page, fixtures: readonly LibraryBookFixture[]) {
  await expectSyncRoot(
    page,
    fixtures.map((fixture) => ({ kind: 'directory', name: fixtureTitle(fixture) }))
  );
}

export async function removeBooksFromSyncRoot(page: Page, fixtures: readonly LibraryBookFixture[]) {
  await Promise.all(fixtures.map((fixture) => removeSyncRootEntry(page, fixtureTitle(fixture))));
}

export async function corruptBookDataInSyncRoot(page: Page, fixture: LibraryBookFixture) {
  await overwriteSyncRootFile(page, fixtureTitle(fixture), 'bookdata_', 'this is not a zip file');
}

export async function expectSourceBookRemoveNotLogged(page: Page, fixture: LibraryBookFixture) {
  expect(await listRemoveEntryLog(page)).not.toContainEqual({
    directoryName: 'fake-sync',
    name: fixtureTitle(fixture),
    recursive: true
  });
}

export async function expectImportFailedForFixture(page: Page, fixture: InvalidImportBookFixture) {
  const { importFailureText } = getFixtureMetadata(fixture);

  const dialog = page.locator('dialog[open]');
  await expect(dialog).toContainText('Book Import Failed');
  await expect(dialog).toContainText(importFailureText);
}

export function bookCard(page: Page, fixture: LibraryBookFixture) {
  return page.locator('[role="banner"]').filter({
    has: page.getByText(fixtureTitle(fixture), { exact: true })
  });
}

function fixturePaths(fixtures: readonly BookFixture[]) {
  return fixtures.map((fixture) => getFixtureMetadata(fixture).path);
}

function fixtureTitle(fixture: LibraryBookFixture) {
  return getFixtureMetadata(fixture).title;
}

function getFixtureMetadata(fixture: LibraryBookFixture): LibraryBookFixtureMetadata;
function getFixtureMetadata(fixture: InvalidImportBookFixture): InvalidImportBookFixtureMetadata;
function getFixtureMetadata(fixture: BookFixture): BookFixtureMetadata;
function getFixtureMetadata(fixture: BookFixture) {
  const metadata = fixtureMetadata.get(fixture);
  if (!metadata) {
    throw new Error(`Unknown book fixture ${fixture}`);
  }
  return metadata;
}

function libraryBookFixtures(fixtures: readonly BookFixture[]) {
  return fixtures.filter(
    (fixture): fixture is LibraryBookFixture =>
      fixture === VALID_BOOK || fixture === LONG_BOOK || fixture === PLAIN_TEXT_BOOK
  );
}
