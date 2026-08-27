import type { SyncRootSnapshotEntry } from './harness.ts';

export interface FakeCloudFolder {
  readonly id: string;
  readonly kind: 'folder';
  name: string;
  readonly parentId: string;
}

export interface FakeCloudFile {
  data: Uint8Array<ArrayBuffer>;
  readonly id: string;
  readonly kind: 'file';
  name: string;
  readonly parentId: string;
}

export type FakeCloudItem = FakeCloudFile | FakeCloudFolder;

type FakeCloudStorageErrorCode = 'invalid-operation' | 'name-conflict' | 'not-found';

export class FakeCloudStorageError extends Error {
  constructor(
    readonly code: FakeCloudStorageErrorCode,
    message: string
  ) {
    super(message);
  }
}

/** Provider-neutral mutable tree behind the HTTP-level Google Drive and OneDrive fakes. */
export class FakeCloudStorage {
  #itemSequence = 0;
  readonly #items = new Map<string, FakeCloudItem>();

  readonly rootId: string;

  constructor(snapshot: readonly SyncRootSnapshotEntry[], rootId = 'fake-cloud-root') {
    this.rootId = rootId;
    this.#addSnapshotEntries(this.rootId, snapshot);
  }

  get(id: string): FakeCloudItem | undefined {
    return this.#items.get(id);
  }

  listChildren(parentId: string): FakeCloudItem[] {
    return [...this.#items.values()].filter((item) => item.parentId === parentId);
  }

  findFolder(parentId: string, name: string): FakeCloudFolder | undefined {
    const item = this.listChildren(parentId).find(
      (candidate) => candidate.kind === 'folder' && candidate.name === name
    );
    return item?.kind === 'folder' ? item : undefined;
  }

  createFolder(parentId: string, name: string): FakeCloudFolder {
    this.#requireFolderParent(parentId);
    if (this.listChildren(parentId).some((item) => item.name === name)) {
      throw new FakeCloudStorageError(
        'name-conflict',
        `An item named ${name} already exists under ${parentId}`
      );
    }

    const folder: FakeCloudFolder = {
      id: this.#newId('folder'),
      kind: 'folder',
      name,
      parentId
    };
    this.#items.set(folder.id, folder);
    return folder;
  }

  putFile(
    parentId: string,
    name: string,
    data: Uint8Array<ArrayBuffer>,
    existingId?: string
  ): FakeCloudFile {
    this.#requireFolderParent(parentId);

    if (existingId) {
      const existing = this.#items.get(existingId);
      if (!existing || existing.kind !== 'file') {
        throw new FakeCloudStorageError(
          'not-found',
          `Cannot update missing fake cloud file ${existingId}`
        );
      }
      if (existing.parentId !== parentId) {
        throw new FakeCloudStorageError(
          'invalid-operation',
          `Cannot move fake cloud file ${existingId} while updating it`
        );
      }
      if (
        this.listChildren(parentId).some((item) => item.id !== existingId && item.name === name)
      ) {
        throw new FakeCloudStorageError(
          'name-conflict',
          `An item named ${name} already exists under ${parentId}`
        );
      }
      existing.name = name;
      existing.data = data.slice();
      return existing;
    }

    if (this.listChildren(parentId).some((item) => item.name === name)) {
      throw new FakeCloudStorageError(
        'name-conflict',
        `An item named ${name} already exists under ${parentId}`
      );
    }

    const file: FakeCloudFile = {
      data: data.slice(),
      id: this.#newId('file'),
      kind: 'file',
      name,
      parentId
    };
    this.#items.set(file.id, file);
    return file;
  }

  rename(id: string, name: string): FakeCloudItem {
    const item = this.#items.get(id);
    if (!item) {
      throw new FakeCloudStorageError('not-found', `Cannot rename missing fake cloud item ${id}`);
    }
    if (
      this.listChildren(item.parentId).some(
        (candidate) => candidate.id !== id && candidate.name === name
      )
    ) {
      throw new FakeCloudStorageError(
        'name-conflict',
        `An item named ${name} already exists under ${item.parentId}`
      );
    }
    item.name = name;
    return item;
  }

  delete(id: string): boolean {
    const item = this.#items.get(id);
    if (!item) return false;
    if (item.kind === 'folder') {
      for (const child of this.listChildren(item.id)) this.delete(child.id);
    }
    return this.#items.delete(id);
  }

  hasFolder(name: string): boolean {
    return this.findFolder(this.rootId, name) !== undefined;
  }

  fileNamesInFolder(name: string): string[] {
    const folder = this.findFolder(this.rootId, name);
    if (!folder) return [];
    return this.listChildren(folder.id)
      .filter((item): item is FakeCloudFile => item.kind === 'file')
      .map((file) => file.name)
      .sort();
  }

  #addSnapshotEntries(parentId: string, entries: readonly SyncRootSnapshotEntry[]): void {
    for (const entry of entries) {
      if (entry.kind === 'file') {
        this.putFile(parentId, entry.name, entry.data);
        continue;
      }
      const folder = this.createFolder(parentId, entry.name);
      this.#addSnapshotEntries(folder.id, entry.entries);
    }
  }

  #newId(kind: FakeCloudItem['kind']): string {
    return `fake-cloud-${kind}-${++this.#itemSequence}`;
  }

  #requireFolderParent(parentId: string): void {
    if (parentId === this.rootId) return;
    const parent = this.#items.get(parentId);
    if (!parent || parent.kind !== 'folder') {
      throw new FakeCloudStorageError('not-found', `Missing fake cloud parent folder ${parentId}`);
    }
  }
}
