import { resolve } from 'node:path';
import { expect, type Page } from '@playwright/test';
import {
  listSyncRoot,
  listRemoveEntryLog,
  overwriteSyncRootFile,
  removeSyncRootEntry,
  SYNC_ASSERTION_TIMEOUT,
  type SyncRootOptions
} from './harness.ts';
import { navigateToManage, navigateToStatisticsSummary } from './navigation.ts';
import { openTOC, showReaderHeader } from './reader.ts';

const NOT_A_ZIP_BOOK = 'not-a-zip-book';
const NOT_AN_EPUB_BOOK = 'not-an-epub-book';

export const COVER_REFRESH_BOOK = 'cover-refresh-book';
export const LONG_BOOK = 'long-book';
export const LONG_BOOK_CHAPTER_CHARACTERS = 7519;
export const MEDIA_SIZING_BOOK = 'media-sizing-book';
export const PLAIN_TEXT_BOOK = 'plain-text-book';
export const SPOILER_IMAGE_GALLERY_BOOK = 'spoiler-image-gallery-book';
export const VALID_BOOK = 'valid-book';
export const INVALID_IMPORT_BOOKS = [NOT_A_ZIP_BOOK, NOT_AN_EPUB_BOOK] as const;

export type LibraryBookFixture =
  | typeof COVER_REFRESH_BOOK
  | typeof VALID_BOOK
  | typeof LONG_BOOK
  | typeof MEDIA_SIZING_BOOK
  | typeof SPOILER_IMAGE_GALLERY_BOOK
  | typeof PLAIN_TEXT_BOOK;
export type InvalidImportBookFixture = typeof NOT_A_ZIP_BOOK | typeof NOT_AN_EPUB_BOOK;
export type BookFixture = LibraryBookFixture | InvalidImportBookFixture;

interface BaseBookFixtureMetadata {
  path: string;
}

interface LibraryBookFixtureMetadata extends BaseBookFixtureMetadata {
  title: string;
  readerText: string;
  partwayBookmark?: PartwayBookmarkMetadata;
}

interface InvalidImportBookFixtureMetadata extends BaseBookFixtureMetadata {
  importFailureDescription: string;
  importFailureText: string;
}

interface PartwayBookmarkMetadata {
  tocButtonTitle: string;
  minimumFooterPage: number;
  progressValue: string;
}

type BookFixtureMetadata = LibraryBookFixtureMetadata | InvalidImportBookFixtureMetadata;
interface ManageBookExpectations {
  placeholders: readonly LibraryBookFixture[];
  downloaded: readonly LibraryBookFixture[];
}

interface StatisticRowExpectation {
  fixture: LibraryBookFixture;
  dateKey: string;
}

interface RecordStatisticOptions {
  durationMs?: number;
}

const fixtureRoot = resolve(import.meta.dirname, '../fixtures/books');
const fixtureMetadata = new Map<BookFixture, BookFixtureMetadata>([
  [
    COVER_REFRESH_BOOK,
    {
      title: 'Cover refresh book',
      path: resolve(fixtureRoot, 'cover-refresh-book.epub'),
      readerText: 'This book has a deterministic cover image.'
    }
  ],
  [
    SPOILER_IMAGE_GALLERY_BOOK,
    {
      title: 'Spoiler image gallery book',
      path: resolve(fixtureRoot, 'spoiler-image-gallery-book.epub'),
      readerText: 'The second illustration should start hidden too.'
    }
  ],
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
      readerText: 'This is paragraph 1 in chapter 1.',
      partwayBookmark: {
        tocButtonTitle: 'Go to Chapter 4',
        minimumFooterPage: 1_000,
        progressValue: '38'
      }
    }
  ],
  [
    MEDIA_SIZING_BOOK,
    {
      title: 'Media sizing book',
      path: resolve(fixtureRoot, 'media-sizing-book.epub'),
      readerText: 'This chapter exercises oversized media and an inline glyph'
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

export async function startImportBookFixtures(page: Page, fixtures: readonly BookFixture[]) {
  await navigateToManage(page);
  const importButton = page.getByRole('button', { name: 'Import Files' });
  await expect(importButton).toBeVisible();
  const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), importButton.click()]);
  await fileChooser.setFiles(fixturePaths(fixtures));
}

export async function importBookFixtures(page: Page, fixtures: readonly BookFixture[]) {
  await startImportBookFixtures(page, fixtures);
  await Promise.all(
    libraryBookFixtures(fixtures).map((fixture) =>
      expect(page.getByText(fixtureTitle(fixture), { exact: true })).toBeVisible({
        timeout: SYNC_ASSERTION_TIMEOUT
      })
    )
  );
}

/**
 * Asserts the complete `/manage` book-card state for known fixtures. Any fixture not listed in
 * `placeholders` or `downloaded` is expected to be absent, so specs do not accidentally leave
 * stale books around after sync or delete workflows.
 */
export async function expectBooksInManage(
  page: Page,
  { placeholders, downloaded }: ManageBookExpectations
) {
  await navigateToManage(page);

  const placeholderFixtures = new Set(placeholders);
  const downloadedFixtures = new Set(downloaded);
  const fixturesInBothStates = placeholderFixtures.intersection(downloadedFixtures);
  if (placeholderFixtures.size !== placeholders.length) {
    throw new Error('A fixture appears more than once in /manage placeholder expectations');
  }
  if (downloadedFixtures.size !== downloaded.length) {
    throw new Error('A fixture appears more than once in /manage downloaded expectations');
  }
  if (fixturesInBothStates.size > 0) {
    throw new Error(
      `Fixtures appear in both /manage placeholder and downloaded expectations: ${[...fixturesInBothStates].join(', ')}`
    );
  }

  const expectedBookCount = placeholderFixtures.size + downloadedFixtures.size;

  await expect(page.locator('article')).toHaveCount(expectedBookCount, {
    timeout: SYNC_ASSERTION_TIMEOUT
  });
  await Promise.all([
    ...placeholders.map(async (fixture) => {
      await expect(bookCard(page, fixture)).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
      await expect(bookPlaceholderIndicator(page, fixture)).toBeVisible({
        timeout: SYNC_ASSERTION_TIMEOUT
      });
    }),
    ...downloaded.map(async (fixture) => {
      await expect(bookCard(page, fixture)).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
      await expect(bookPlaceholderIndicator(page, fixture)).toHaveCount(0, {
        timeout: SYNC_ASSERTION_TIMEOUT
      });
    })
  ]);
}

export async function recordStatisticForBook(
  page: Page,
  fixture: LibraryBookFixture,
  dateKey: string,
  { durationMs = 2_000 }: RecordStatisticOptions = {}
) {
  await page.clock.setSystemTime(new Date(`${dateKey}T12:00:00Z`));
  await openBookFromManage(page, fixture);

  await page.getByRole('button', { name: 'Resume reading tracker' }).click();
  await expect(page.getByRole('button', { name: 'Pause reading tracker' })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });

  await page.clock.runFor(durationMs);
  await page.getByRole('button', { name: 'Pause reading tracker' }).click();
  await expect(page.getByRole('button', { name: 'Resume reading tracker' })).toBeVisible({
    timeout: SYNC_ASSERTION_TIMEOUT
  });
}

export async function expectStatisticsInSummary(
  page: Page,
  {
    present,
    absent = []
  }: { present: readonly StatisticRowExpectation[]; absent?: readonly StatisticRowExpectation[] }
) {
  await showAllStatistics(page);

  await Promise.all([
    ...present.map(async ({ fixture, dateKey }) => {
      await expect(page.getByText(dateKey, { exact: true })).toBeVisible({
        timeout: SYNC_ASSERTION_TIMEOUT
      });
      await expect(page.getByText(fixtureTitle(fixture), { exact: true }).first()).toBeVisible({
        timeout: SYNC_ASSERTION_TIMEOUT
      });
    }),
    ...absent.map(async ({ dateKey }) => {
      await expect(page.getByText(dateKey, { exact: true })).toHaveCount(0, {
        timeout: SYNC_ASSERTION_TIMEOUT
      });
    })
  ]);
}

export async function expectNoStatisticsInSummary(page: Page) {
  await showAllStatistics(page);
  await expect(page.getByText(/No Data found/)).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
}

export async function deleteAllStatisticsFromSummary(page: Page) {
  await showAllStatistics(page);
  const settings = await openStatisticsSettings(page);
  await settings.getByRole('button', { name: 'Delete All' }).click();

  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Delete data' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.getByText(/No Data found/)).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
}

export async function openBookFromManage(page: Page, fixture: LibraryBookFixture) {
  await navigateToManage(page);
  await bookCard(page, fixture).click();
  await page.waitForURL((url) => url.pathname === '/b' && url.searchParams.has('id'));
}

export async function expectBookReaderText(page: Page, fixture: LibraryBookFixture) {
  const { readerText } = getFixtureMetadata(fixture);
  await expect(page.getByText(readerText)).toBeVisible();
}

export async function deleteBookFromManage(page: Page, fixture: LibraryBookFixture) {
  await navigateToManage(page);
  const bookTitle = page.getByText(fixtureTitle(fixture), { exact: true });
  await expect(bookTitle).toBeVisible();

  await page.getByRole('button', { name: 'Select' }).click();
  await bookTitle.click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  const dialog = page.locator('dialog[open]').filter({
    has: page.getByRole('heading', { name: 'Remove book from library?' })
  });
  await dialog.getByRole('button', { name: 'Remove', exact: true }).click();

  await expect(bookTitle).toHaveCount(0);
}

export function bookProgressBar(page: Page, fixture: LibraryBookFixture) {
  return bookCard(page, fixture).getByRole('progressbar', { name: /Reading progress/ });
}

export async function replaceBookCoverInSyncRoot(
  page: Page,
  fixture: LibraryBookFixture,
  contents: Uint8Array<ArrayBuffer>,
  options?: SyncRootOptions
) {
  await overwriteSyncRootFile(page, fixtureTitle(fixture), 'cover_', contents, options);
}

export async function bookmarkFixturePartway(page: Page, fixture: LibraryBookFixture) {
  await bookmarkFixtureAtTOCEntry(page, fixture, getPartwayBookmark(fixture));
}

export async function expectBookPartwayProgress(page: Page, fixture: LibraryBookFixture) {
  await expect(bookProgressBar(page, fixture)).toHaveAttribute(
    'value',
    getPartwayBookmark(fixture).progressValue
  );
}

async function bookmarkFixtureAtTOCEntry(
  page: Page,
  fixture: LibraryBookFixture,
  { tocButtonTitle, minimumFooterPage }: PartwayBookmarkMetadata
) {
  await openBookFromManage(page, fixture);
  await openTOC(page);
  await page.getByTitle(tocButtonTitle).click();
  await expect
    .poll(async () => {
      const footerText = await page.locator('#miwake-page-footer').innerText();
      return Number(/(\d+) \/ \d+/.exec(footerText)?.[1] ?? 0);
    })
    .toBeGreaterThan(minimumFooterPage);
  const readerHeader = await showReaderHeader(page);
  await readerHeader.getByRole('button', { name: 'Bookmark' }).click();
  await showReaderHeader(page);
  await expect(page.getByRole('button', { name: 'Return to Bookmark' })).toBeVisible();
}

/**
 * Asserts the top-level sync-source book folders only. Keep lower-level filename assertions out of
 * specs unless `bookdata_*`, `progress_*`, or similar internal names are the behavior under test.
 */
export async function expectBooksInSyncRoot(
  page: Page,
  fixtures: readonly LibraryBookFixture[],
  options?: SyncRootOptions
) {
  const expectedEntries = fixtures
    .map((fixture) => ({ kind: 'directory', name: fixtureTitle(fixture) }))
    .sort((a, b) => a.name.localeCompare(b.name));

  await expect
    .poll(() => listSyncRoot(page, options), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toEqual(expectedEntries);
}

/**
 * Source-side assertion for statistics propagation. It intentionally counts only statistics rows
 * with positive reading time, matching the rows that can appear in the statistics summary UI.
 */
export async function expectBookStatisticsInSyncRoot(
  page: Page,
  fixture: LibraryBookFixture,
  dateKeys: readonly string[],
  options?: SyncRootOptions
) {
  await expect
    .poll(() => listBookStatisticsInSyncRoot(page, fixture, options), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toEqual([...dateKeys].sort());
}

export async function removeBooksFromSyncRoot(
  page: Page,
  fixtures: readonly LibraryBookFixture[],
  options?: SyncRootOptions
) {
  await Promise.all(
    fixtures.map((fixture) => removeSyncRootEntry(page, fixtureTitle(fixture), options))
  );
}

export async function corruptBookDataInSyncRoot(
  page: Page,
  fixture: LibraryBookFixture,
  options?: SyncRootOptions
) {
  await overwriteSyncRootFile(
    page,
    fixtureTitle(fixture),
    'bookdata_',
    'this is not a zip file',
    options
  );
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
  await expect(dialog).toContainText('Error importing books');
  await expect(dialog).toContainText(importFailureText);
  await expect(dialog.getByRole('link', { name: 'Open Issue Tracker' })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Download Logs' })).toBeVisible();
}

export function bookCard(page: Page, fixture: LibraryBookFixture) {
  return page.locator('article').filter({
    has: page.getByText(fixtureTitle(fixture), { exact: true })
  });
}

function bookPlaceholderIndicator(page: Page, fixture: LibraryBookFixture) {
  return bookCard(page, fixture).getByTitle(/Not downloaded yet/);
}

async function showAllStatistics(page: Page) {
  await navigateToStatisticsSummary(page);
  const settings = await openStatisticsSettings(page);
  await settings.getByRole('button', { name: 'Set to all time for the selected books' }).click();
  await settings.getByTitle('Close statistics settings').click();
  await expect(settings).toHaveCount(0, { timeout: SYNC_ASSERTION_TIMEOUT });
}

export async function openStatisticsSettings(page: Page) {
  const settings = statisticsSettingsDialog(page);
  if (await settings.isVisible()) {
    return settings;
  }

  await page.getByRole('button', { name: 'Statistics Settings', exact: true }).click();
  await expect(settings).toBeVisible({ timeout: SYNC_ASSERTION_TIMEOUT });
  return settings;
}

function statisticsSettingsDialog(page: Page) {
  return page.locator('dialog.sidebar-overlay[open]').filter({
    has: page.getByRole('button', { name: 'Delete All' })
  });
}

async function listBookStatisticsInSyncRoot(
  page: Page,
  fixture: LibraryBookFixture,
  { rootName = 'fake-sync' }: SyncRootOptions = {}
) {
  return page.evaluate(
    async ({ rootName, title }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(rootName, { create: true });
      const directory = await root.getDirectoryHandle(title);

      const dateKeys: string[] = [];
      for await (const [name, handle] of directory.entries()) {
        if (!(handle instanceof FileSystemFileHandle) || !name.startsWith('statistics_')) continue;

        const file = await handle.getFile();
        const statistics = JSON.parse(await file.text()) as Array<{
          dateKey?: string;
          readingTime?: number;
        }>;
        for (const statistic of statistics) {
          if (statistic.dateKey && Number(statistic.readingTime) > 0) {
            dateKeys.push(statistic.dateKey);
          }
        }
      }

      return dateKeys.sort();
    },
    { rootName, title: fixtureTitle(fixture) }
  );
}

function fixturePaths(fixtures: readonly BookFixture[]) {
  return fixtures.map((fixture) => getFixtureMetadata(fixture).path);
}

export function fixtureTitle(fixture: LibraryBookFixture) {
  return getFixtureMetadata(fixture).title;
}

export function longBookChapterStartCharacter(chapterNumber: number) {
  return (chapterNumber - 1) * LONG_BOOK_CHAPTER_CHARACTERS;
}

function getPartwayBookmark(fixture: LibraryBookFixture) {
  const { partwayBookmark } = getFixtureMetadata(fixture);
  if (!partwayBookmark) {
    throw new Error(`${fixture} does not define a partway bookmark position`);
  }
  return partwayBookmark;
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
      fixture === COVER_REFRESH_BOOK ||
      fixture === VALID_BOOK ||
      fixture === LONG_BOOK ||
      fixture === SPOILER_IMAGE_GALLERY_BOOK ||
      fixture === PLAIN_TEXT_BOOK
  );
}
