import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { connectToCloud } from '../helpers/cloud.ts';
import {
  expectBookReaderText,
  fixtureTitle,
  importBookFixtures,
  LONG_BOOK,
  openBookFromManage
} from '../helpers/fixtures.ts';
import { FakeGoogleDrive } from '../helpers/fake-google-drive.ts';
import {
  expect,
  SYNC_ASSERTION_TIMEOUT,
  TEST_SYNC_PUSH_DEBOUNCE_MS,
  test
} from '../helpers/harness.ts';
import { pressReaderShortcut, showReaderHeader } from '../helpers/reader.ts';
import { waitForSuccessfulSync } from '../helpers/workflows.ts';

test('offline bookmark changes replay to Google Drive when the network returns', async ({
  context,
  page
}) => {
  await page.clock.install({ time: new Date('2026-05-10T12:00:00Z') });
  const fakeDrive = new FakeGoogleDrive([]);
  await fakeDrive.install(context);
  await connectToCloud(page, SyncEndpointType.GDRIVE);
  await importBookFixtures(page, [LONG_BOOK]);

  const title = fixtureTitle(LONG_BOOK);
  await expect
    .poll(() => fakeDrive.hasBookData(title), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toBe(true);
  await waitForSuccessfulSync(page);
  await openBookFromManage(page, LONG_BOOK);
  await expectBookReaderText(page, LONG_BOOK);
  await waitForSuccessfulSync(page);
  expect(progressFileNames(fakeDrive, title)).toEqual([]);

  await context.setOffline(true);
  await expect(
    page.getByRole('button', { name: "Offline — changes will sync when you're back online" })
  ).toBeVisible();
  await pressReaderShortcut(page, 'b');
  const readerHeader = await showReaderHeader(page);
  await expect(readerHeader.getByRole('button', { name: 'Return to Bookmark' })).toBeVisible();

  // Advance the test-only debounce while still offline so this assertion proves the mutation was
  // queued for replay rather than merely waiting to start its first push.
  await page.clock.runFor(TEST_SYNC_PUSH_DEBOUNCE_MS);
  expect(progressFileNames(fakeDrive, title)).toEqual([]);

  await context.setOffline(false);
  await expect
    .poll(() => progressFileNames(fakeDrive, title), { timeout: SYNC_ASSERTION_TIMEOUT })
    .toHaveLength(1);
});

function progressFileNames(fakeDrive: FakeGoogleDrive, title: string): string[] {
  return fakeDrive.bookFileNames(title).filter((filename) => filename.startsWith('progress_'));
}
