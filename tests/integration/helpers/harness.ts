import {
  test as base,
  expect,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo
} from '@playwright/test';

export { expect };

interface RemoveEntryCall {
  directoryName: string;
  name: string;
  recursive: boolean;
}

interface SyncRootEntry {
  kind: string;
  name: string;
}

interface ExpectedSyncRootEntry {
  kind: string | Record<string, any>;
  name: string | Record<string, any>;
}

type SyncRootSnapshotEntry =
  | { kind: 'directory'; name: string; entries: SyncRootSnapshotEntry[] }
  | { kind: 'file'; name: string; data: Uint8Array<ArrayBuffer> };

declare global {
  interface Window {
    __miwakeTestRemoveEntryLog?: RemoveEntryCall[];
    __miwakeTestSyncPushDebounceMs?: number;
    __miwakeTestSetVisibilityState?: (state: DocumentVisibilityState) => void;
  }
}

export const SYNC_ASSERTION_TIMEOUT = 15_000;

/**
 * Extended Playwright test with the OPFS-backed showDirectoryPicker mock installed via
 * context.addInitScript. Tests should import `test` and `expect` from this module instead of
 * `@playwright/test`.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await installTestInitScripts(context);
    await use(context);
  }
});

export async function newPageInTestContext(browser: Browser, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL;
  const context = await browser.newContext({
    baseURL: typeof baseURL === 'string' ? baseURL : undefined
  });
  await installTestInitScripts(context);
  return { context, page: await context.newPage() };
}

async function installTestInitScripts(context: BrowserContext) {
  await context.addInitScript(pickerInitScript);
}

async function listSyncRoot(page: Page): Promise<SyncRootEntry[]> {
  return page.evaluate(async () => {
    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
    const result: SyncRootEntry[] = [];

    for await (const [name, handle] of root.entries()) {
      result.push({ kind: handle.kind, name });
    }

    return result.sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function expectSyncRoot(
  page: Page,
  entries: ExpectedSyncRootEntry[],
  options?: { timeout?: number }
) {
  await expect
    .poll(() => listSyncRoot(page), { timeout: SYNC_ASSERTION_TIMEOUT, ...options })
    .toEqual(entries);
}

export async function clearRemoveEntryLog(page: Page) {
  await page.evaluate(() => {
    window.__miwakeTestRemoveEntryLog = [];
  });
}

export async function listRemoveEntryLog(page: Page): Promise<RemoveEntryCall[]> {
  return page.evaluate(() => window.__miwakeTestRemoveEntryLog ?? []);
}

export async function removeSyncRootEntry(page: Page, name: string) {
  await page.evaluate(
    async ({ name }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
      await root.removeEntry(name, { recursive: true });
    },
    { name }
  );
}

export async function overwriteSyncRootFile(
  page: Page,
  directoryName: string,
  filenamePrefix: string,
  contents: string
) {
  await page.evaluate(
    async ({ directoryName, filenamePrefix, contents }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
      const directory = await root.getDirectoryHandle(directoryName);

      for await (const [name, handle] of directory.entries()) {
        if (handle.kind !== 'file' || !name.startsWith(filenamePrefix)) continue;

        const fileHandle = handle as FileSystemFileHandle;
        const writer = await fileHandle.createWritable();
        await writer.write(contents);
        await writer.close();
        return;
      }

      throw new Error(`Unable to find ${filenamePrefix} file under ${directoryName}`);
    },
    { directoryName, filenamePrefix, contents }
  );
}

/**
 * Copy the OPFS-backed fake sync root into another isolated BrowserContext. This intentionally
 * copies only the sync source, not app-local IDB or localStorage, so the receiving page still
 * behaves like a separate device/profile.
 */
export async function copySyncRoot(sourcePage: Page, targetPage: Page) {
  const snapshot = await sourcePage.evaluate(async () => {
    async function snapshotDirectory(
      directory: FileSystemDirectoryHandle
    ): Promise<SyncRootSnapshotEntry[]> {
      const entries: SyncRootSnapshotEntry[] = [];

      for await (const [name, handle] of directory.entries()) {
        if (handle instanceof FileSystemDirectoryHandle) {
          entries.push({
            kind: 'directory',
            name,
            entries: await snapshotDirectory(handle)
          });
        } else {
          const file = await handle.getFile();
          entries.push({
            kind: 'file',
            name,
            data: await file.bytes()
          });
        }
      }

      return entries.sort((a, b) => a.name.localeCompare(b.name));
    }

    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
    return snapshotDirectory(root);
  });

  await targetPage.evaluate(async (snapshot) => {
    async function clearDirectory(directory: FileSystemDirectoryHandle) {
      for await (const [name] of directory.entries()) {
        await directory.removeEntry(name, { recursive: true });
      }
    }

    async function restoreEntries(
      directory: FileSystemDirectoryHandle,
      entries: SyncRootSnapshotEntry[]
    ) {
      for (const entry of entries) {
        if (entry.kind === 'directory') {
          const child = await directory.getDirectoryHandle(entry.name, { create: true });
          await restoreEntries(child, entry.entries);
        } else {
          const file = await directory.getFileHandle(entry.name, { create: true });
          const writer = await file.createWritable();
          await writer.write(entry.data);
          await writer.close();
        }
      }
    }

    const opfs = await navigator.storage.getDirectory();
    const root = await opfs.getDirectoryHandle('fake-sync', { create: true });
    await clearDirectory(root);
    await restoreEntries(root, snapshot);
  }, snapshot);
}

export async function setDocumentVisibility(page: Page, state: DocumentVisibilityState) {
  await page.evaluate((state) => {
    window.__miwakeTestSetVisibilityState?.(state);
  }, state);
}

/**
 * Init script: runs in the page before any app code. Patches showDirectoryPicker to return an
 * OPFS-backed handle rooted at /fake-sync, and patches FileSystemDirectoryHandle permission methods
 * to return 'granted' so the app's permission gate is no-op in tests.
 *
 * showDirectoryPicker isn't driveable from Playwright (user-gesture-gated with native chrome).
 * FileSystemDirectoryHandle is structurally identical whether it comes from the picker or from
 * navigator.storage.getDirectory, so substituting an OPFS handle gives the app a fully-functional
 * filesystem to write to without any picker UI.
 *
 * Playwright 1.60 does not expose a public API for making a headless page become hidden, and
 * `page.bringToFront()` leaves all pages visible in this runner. Chromium's lifecycle CDP hooks
 * also do not update `document.visibilityState` or fire `visibilitychange`, so the same init script
 * installs a narrow Page Visibility seam that tests can drive with `setDocumentVisibility()`.
 */
function pickerInitScript() {
  window.__miwakeTestSyncPushDebounceMs = 50;

  FileSystemDirectoryHandle.prototype.queryPermission = async () => 'granted';
  FileSystemDirectoryHandle.prototype.requestPermission = async () => 'granted';

  let testVisibilityState: DocumentVisibilityState = 'visible';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => testVisibilityState
  });
  window.__miwakeTestSetVisibilityState = (state: DocumentVisibilityState) => {
    testVisibilityState = state;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  window.__miwakeTestRemoveEntryLog = [];
  const originalRemoveEntry = FileSystemDirectoryHandle.prototype.removeEntry;
  FileSystemDirectoryHandle.prototype.removeEntry = async function (
    this: FileSystemDirectoryHandle,
    name: string,
    options?: { recursive?: boolean }
  ) {
    window.__miwakeTestRemoveEntryLog?.push({
      directoryName: this.name,
      name,
      recursive: options?.recursive === true
    });
    return originalRemoveEntry.call(this, name, options);
  };

  window.showDirectoryPicker = async () => {
    const opfs = await navigator.storage.getDirectory();
    return opfs.getDirectoryHandle('fake-sync', { create: true });
  };
}
