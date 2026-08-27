import { describe, expect, test } from 'vitest';
import {
  FakeCloudStorage,
  FakeCloudStorageError
} from '../integration/helpers/fake-cloud-storage.ts';
import { fakeCloudStorageErrorStatus } from '../integration/helpers/fake-cloud-http.ts';

describe('FakeCloudStorage', () => {
  test('rejects an update that would duplicate a sibling name', () => {
    const storage = new FakeCloudStorage([]);
    const folder = storage.createFolder(storage.rootId, 'Book');
    const first = storage.putFile(folder.id, 'first.json', new Uint8Array([1]));
    storage.putFile(folder.id, 'second.json', new Uint8Array([2]));

    expectStorageError(
      () => storage.putFile(folder.id, 'second.json', new Uint8Array([3]), first.id),
      'name-conflict',
      409
    );
  });

  test('classifies missing parents separately from name conflicts', () => {
    const storage = new FakeCloudStorage([]);
    expectStorageError(() => storage.createFolder('missing-parent', 'Book'), 'not-found', 404);
  });
});

function expectStorageError(
  action: () => unknown,
  code: FakeCloudStorageError['code'],
  status: number
): void {
  let error: unknown;
  try {
    action();
  } catch (caught) {
    error = caught;
  }

  expect(error).toMatchObject({ code });
  expect(error).toBeInstanceOf(FakeCloudStorageError);
  expect(fakeCloudStorageErrorStatus(error)).toBe(status);
}
