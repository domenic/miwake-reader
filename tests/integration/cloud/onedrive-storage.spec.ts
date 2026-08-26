import type { BrowserContext, Page } from '@playwright/test';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloud } from '../helpers/cloud.ts';
import {
  bookmarkFixturePartway,
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

test('ambiently uploads an imported book to OneDrive', async ({ context, page }) => {
  const fakeDrive = await connectToEmptyFakeOneDrive(context, page);

  await importBookFixtures(page, [VALID_BOOK]);
  await expectBookUploaded(fakeDrive, VALID_BOOK);
  await waitForSuccessfulSync(page);
});

test('updates and renames an existing OneDrive progress file', async ({ context, page }) => {
  await page.clock.install({ time: new Date('2026-05-01T12:00:00Z') });
  const fakeDrive = await connectToEmptyFakeOneDrive(context, page);
  await importBookFixtures(page, [LONG_BOOK]);
  await expectBookUploaded(fakeDrive, LONG_BOOK);

  const title = fixtureTitle(LONG_BOOK);
  await bookmarkFixturePartway(page, LONG_BOOK);
  await expect
    .poll(() => progressFileNames(fakeDrive, title), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toHaveLength(1);
  const [initialProgressFilename] = progressFileNames(fakeDrive, title);

  await page.clock.setSystemTime(new Date('2026-05-02T12:00:00Z'));
  await completeCurrentBook(page);

  await expect
    .poll(
      () => {
        const filenames = progressFileNames(fakeDrive, title);
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

function progressFileNames(fakeDrive: FakeOneDrive, title: string): string[] {
  return fakeDrive.bookFileNames(title).filter((filename) => filename.startsWith('progress_'));
}
