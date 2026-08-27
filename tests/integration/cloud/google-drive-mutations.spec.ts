import type { BrowserContext, Page } from '@playwright/test';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloud } from '../helpers/cloud.ts';
import {
  bookmarkFixturePartway,
  deleteBookFromManage,
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  recordStatisticForBook,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { navigateToManage } from '../helpers/navigation.ts';
import { completeCurrentBook } from '../helpers/reader.ts';
import { enableStatistics, setReadingGoal, waitForSuccessfulSync } from '../helpers/workflows.ts';

test('importing a book ambiently creates its folder and data in Google Drive', async ({
  context,
  page
}) => {
  const fakeDrive = await connectToEmptyFakeGoogleDrive(context, page);

  expect(fakeDrive.bookTitles()).toEqual([]);

  await importBookFixtures(page, [VALID_BOOK]);

  await expectUploadedBook(fakeDrive, fixtureTitle(VALID_BOOK));
  await waitForSuccessfulSync(page);
});

test('bookmark changes update the existing Google Drive progress file', async ({
  context,
  page
}) => {
  const fakeDrive = await connectToEmptyFakeGoogleDrive(context, page);
  await importBookFixtures(page, [LONG_BOOK]);

  const title = fixtureTitle(LONG_BOOK);
  await expectUploadedBook(fakeDrive, title);
  await waitForSuccessfulSync(page);

  await bookmarkFixturePartway(page, LONG_BOOK);
  await expect
    .poll(() => fakeDrive.progressFileNames(title), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toHaveLength(1);
  const [initialProgressFilename] = fakeDrive.progressFileNames(title);
  await waitForSuccessfulSync(page);

  await completeCurrentBook(page);

  await expect
    .poll(
      () => {
        const filenames = fakeDrive.progressFileNames(title);
        return {
          completed: filenames[0]?.endsWith('_completed.json') === true,
          count: filenames.length,
          replaced: filenames[0] !== initialProgressFilename
        };
      },
      { timeout: SYNC_ASSERTION_TIMEOUT }
    )
    .toEqual({ completed: true, count: 1, replaced: true });
  await waitForSuccessfulSync(page);
});

test('removing a book from the library recursively deletes it from Google Drive', async ({
  context,
  page
}) => {
  const fakeDrive = await connectToEmptyFakeGoogleDrive(context, page);
  await importBookFixtures(page, [VALID_BOOK]);

  const title = fixtureTitle(VALID_BOOK);
  await expectUploadedBook(fakeDrive, title);
  await waitForSuccessfulSync(page);

  await deleteBookFromManage(page, VALID_BOOK);

  await expect
    .poll(
      () => ({
        bookTitles: fakeDrive.bookTitles(),
        fileNames: fakeDrive.bookFileNames(title),
        hasBook: fakeDrive.hasBook(title)
      }),
      { timeout: SYNC_ASSERTION_TIMEOUT }
    )
    .toEqual({ bookTitles: [], fileNames: [], hasBook: false });
  await waitForSuccessfulSync(page);
});

test('book deletion waits for an in-flight Google Drive push', async ({ context, page }) => {
  await page.clock.install({ time: new Date('2026-04-10T11:59:00Z') });
  await enableStatistics(page);
  const fakeDrive = await connectToEmptyFakeGoogleDrive(context, page);
  await importBookFixtures(page, [VALID_BOOK]);

  const title = fixtureTitle(VALID_BOOK);
  await expectUploadedBook(fakeDrive, title);
  await waitForSuccessfulSync(page);
  await recordStatisticForBook(page, VALID_BOOK, '2026-04-10');

  const upload = fakeDrive.pauseNextUpload();
  await navigateToManage(page);
  await upload.started;

  try {
    await deleteBookFromManage(page, VALID_BOOK);
    expect(fakeDrive.hasBook(title)).toBe(true);
  } finally {
    upload.release();
  }

  await waitForSuccessfulSync(page);
  expect(fakeDrive.hasBook(title)).toBe(false);
});

test('creating and deleting reading goals rewrites Google Drive root data', async ({
  context,
  page
}) => {
  await page.clock.setFixedTime(new Date('2026-05-22T12:00:00Z'));
  const fakeDrive = await connectToEmptyFakeGoogleDrive(context, page);
  expect(fakeDrive.rootFileNames()).toEqual([]);

  await setReadingGoal(page, { timeGoal: '30', startDate: '2026-05-22' });
  await expect
    .poll(() => fakeDrive.readingGoalFileNames(), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toHaveLength(1);
  expect(fakeDrive.readingGoalStartDates()).toEqual(['2026-05-22']);
  await waitForSuccessfulSync(page);
  const [createdGoalFilename] = fakeDrive.readingGoalFileNames();

  await page.clock.setFixedTime(new Date('2026-05-23T12:00:00Z'));
  await page.getByRole('button', { name: 'Delete goals', exact: true }).click();
  const dialog = page.locator('dialog[open]');
  await expect(dialog.getByRole('heading', { name: 'Data deletion' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Reading time goal (minutes)')).toHaveValue('0');

  await expect
    .poll(
      () => {
        const filenames = fakeDrive.readingGoalFileNames();
        return {
          count: filenames.length,
          replaced: filenames[0] !== createdGoalFilename,
          startDates: fakeDrive.readingGoalStartDates()
        };
      },
      { timeout: SYNC_ASSERTION_TIMEOUT }
    )
    .toEqual({ count: 1, replaced: true, startDates: [] });
  await waitForSuccessfulSync(page);
});

async function connectToEmptyFakeGoogleDrive(context: BrowserContext, page: Page) {
  const fakeDrive = new FakeGoogleDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.GDRIVE);
  await waitForSuccessfulSync(page);
  return fakeDrive;
}

async function expectUploadedBook(fakeDrive: FakeGoogleDrive, title: string): Promise<void> {
  await expect
    .poll(
      () => ({
        bookTitles: fakeDrive.bookTitles(),
        hasBook: fakeDrive.hasBook(title),
        hasBookData: fakeDrive.hasBookData(title)
      }),
      { timeout: SYNC_ASSERTION_TIMEOUT }
    )
    .toEqual({ bookTitles: [title], hasBook: true, hasBookData: true });
}
