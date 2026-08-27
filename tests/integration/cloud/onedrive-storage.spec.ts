import type { BrowserContext, Page } from '@playwright/test';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloud } from '../helpers/cloud.ts';
import {
  bookmarkFixturePartway,
  COVER_REFRESH_BOOK,
  deleteBookFromManage,
  expectBookReaderText,
  expectBooksInManage,
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage,
  type LibraryBookFixture,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { FakeOneDrive } from '../helpers/fake-onedrive.ts';
import { expect, SYNC_ASSERTION_TIMEOUT, test } from '../helpers/harness.ts';
import { completeCurrentBook } from '../helpers/reader.ts';
import { signOutAndWipe, waitForSuccessfulSync } from '../helpers/workflows.ts';

test('lists and downloads a cloud-only book from OneDrive', async ({ context, page }) => {
  const fakeDrive = await FakeOneDrive.fromBookFixtures(page, [VALID_BOOK]);
  await fakeDrive.install(context);
  await signOutAndWipe(page);

  await connectToCloud(page, SyncEndpointType.ONEDRIVE);
  await expectBooksInManage(page, { placeholders: [VALID_BOOK], downloaded: [] });

  await openBookFromManage(page, VALID_BOOK);
  await expectBookReaderText(page, VALID_BOOK);
});

test('lists a cloud-only book while its OneDrive cover thumbnail is pending', async ({
  context,
  page
}) => {
  const fakeDrive = await FakeOneDrive.fromBookFixtures(page, [COVER_REFRESH_BOOK], {
    pendingThumbnails: true
  });
  await fakeDrive.install(context);
  await signOutAndWipe(page);

  await connectToCloud(page, SyncEndpointType.ONEDRIVE);
  await expectBooksInManage(page, { placeholders: [COVER_REFRESH_BOOK], downloaded: [] });
});

test('ambiently uploads an imported book to OneDrive', async ({ context, page }) => {
  const fakeDrive = await connectToEmptyFakeOneDrive(context, page);

  await importBookFixtures(page, [VALID_BOOK]);
  await expectBookUploaded(fakeDrive, VALID_BOOK);
  await waitForSuccessfulSync(page);
});

test('cancels a OneDrive upload session after a failed chunk', async ({ context, page }) => {
  const fakeDrive = await connectToEmptyFakeOneDrive(context, page);
  fakeDrive.failNextUploadChunk();

  await importBookFixtures(page, [VALID_BOOK]);

  await expect
    .poll(
      () => ({
        cancelled: fakeDrive.cancelledUploadSessions,
        failedChunks: fakeDrive.failedUploadChunks,
        remaining: fakeDrive.uploadSessionCount
      }),
      { timeout: SYNC_ASSERTION_TIMEOUT }
    )
    .toEqual({ cancelled: 1, failedChunks: 1, remaining: 0 });
});

test('updates and renames an existing OneDrive progress file', async ({ context, page }) => {
  const fakeDrive = await connectToEmptyFakeOneDrive(context, page);
  await importBookFixtures(page, [LONG_BOOK]);
  await expectBookUploaded(fakeDrive, LONG_BOOK);
  await waitForSuccessfulSync(page);

  const title = fixtureTitle(LONG_BOOK);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await expect
    .poll(() => fakeDrive.progressFileNames(title), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toHaveLength(1);
  const [initialProgressFilename] = fakeDrive.progressFileNames(title);

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

test('deletes a OneDrive book folder recursively', async ({ context, page }) => {
  const fakeDrive = await connectToEmptyFakeOneDrive(context, page);
  await importBookFixtures(page, [VALID_BOOK]);
  await expectBookUploaded(fakeDrive, VALID_BOOK);
  await waitForSuccessfulSync(page);

  await deleteBookFromManage(page, VALID_BOOK);

  await expect
    .poll(
      () => ({
        fileNames: fakeDrive.bookFileNames(fixtureTitle(VALID_BOOK)),
        hasBook: fakeDrive.hasBook(fixtureTitle(VALID_BOOK))
      }),
      { timeout: SYNC_ASSERTION_TIMEOUT }
    )
    .toEqual({ fileNames: [], hasBook: false });
  await waitForSuccessfulSync(page);
});

async function connectToEmptyFakeOneDrive(context: BrowserContext, page: Page) {
  const fakeDrive = new FakeOneDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.ONEDRIVE);
  return fakeDrive;
}

async function expectBookUploaded(fakeDrive: FakeOneDrive, fixture: LibraryBookFixture) {
  await expect
    .poll(() => fakeDrive.hasBookData(fixtureTitle(fixture)), {
      timeout: SYNC_ASSERTION_TIMEOUT
    })
    .toBe(true);
}
