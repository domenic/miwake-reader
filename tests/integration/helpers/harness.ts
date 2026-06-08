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

export interface SyncRootEntry {
  kind: string;
  name: string;
}

export interface SyncRootOptions {
  rootName?: string;
}

type SyncRootSnapshotEntry =
  | { kind: 'directory'; name: string; entries: SyncRootSnapshotEntry[] }
  | { kind: 'file'; name: string; data: Uint8Array<ArrayBuffer> };

const DEFAULT_SYNC_ROOT_NAME = 'fake-sync';

declare global {
  interface Window {
    __miwakeTestRemoveEntryLog?: RemoveEntryCall[];
    __miwakeTestDenyFSAccess?: boolean;
    __miwakeTestFailNextFSListing?: string;
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

/**
 * Creates an additional isolated browser profile with the same baseURL and init scripts as the
 * main test context. Use `await using` so the extra context is always closed.
 */
export async function newPageInTestContext(browser: Browser, testInfo: TestInfo) {
  const baseURL = testInfo.project.use.baseURL ?? process.env.PLAYWRIGHT_TEST_BASE_URL;
  const context = await browser.newContext({
    baseURL: typeof baseURL === 'string' ? baseURL : undefined
  });
  try {
    await installTestInitScripts(context);
    return {
      context,
      page: await context.newPage(),
      async [Symbol.asyncDispose]() {
        await context.close();
      }
    };
  } catch (error) {
    await context.close();
    throw error;
  }
}

async function installTestInitScripts(context: BrowserContext) {
  await context.addInitScript(pickerInitScript);
}

export async function listSyncRoot(
  page: Page,
  { rootName = DEFAULT_SYNC_ROOT_NAME }: SyncRootOptions = {}
): Promise<SyncRootEntry[]> {
  return page.evaluate(
    async ({ rootName }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(rootName, { create: true });
      const result: SyncRootEntry[] = [];

      for await (const [name, handle] of root.entries()) {
        result.push({ kind: handle.kind, name });
      }

      return result.sort((a, b) => a.name.localeCompare(b.name));
    },
    { rootName }
  );
}

export async function clearRemoveEntryLog(page: Page) {
  await page.evaluate(() => {
    window.__miwakeTestRemoveEntryLog = [];
  });
}

export async function listRemoveEntryLog(page: Page): Promise<RemoveEntryCall[]> {
  return page.evaluate(() => window.__miwakeTestRemoveEntryLog ?? []);
}

export async function removeSyncRootEntry(
  page: Page,
  name: string,
  { rootName = DEFAULT_SYNC_ROOT_NAME }: SyncRootOptions = {}
) {
  await page.evaluate(
    async ({ name, rootName }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(rootName, { create: true });
      await root.removeEntry(name, { recursive: true });
    },
    { name, rootName }
  );
}

export async function overwriteSyncRootFile(
  page: Page,
  directoryName: string,
  filenamePrefix: string,
  contents: string | Uint8Array<ArrayBuffer>,
  { rootName = DEFAULT_SYNC_ROOT_NAME }: SyncRootOptions = {}
) {
  const serializedContents = typeof contents === 'string' ? contents : [...contents];
  await page.evaluate(
    async ({ directoryName, filenamePrefix, contents, rootName }) => {
      const opfs = await navigator.storage.getDirectory();
      const root = await opfs.getDirectoryHandle(rootName, { create: true });
      const directory = await root.getDirectoryHandle(directoryName);

      for await (const [name, handle] of directory.entries()) {
        if (handle.kind !== 'file' || !name.startsWith(filenamePrefix)) continue;

        const fileHandle = handle as FileSystemFileHandle;
        const writer = await fileHandle.createWritable();
        await writer.write(typeof contents === 'string' ? contents : new Uint8Array(contents));
        await writer.close();
        return;
      }

      throw new Error(`Unable to find ${filenamePrefix} file under ${directoryName}`);
    },
    { directoryName, filenamePrefix, contents: serializedContents, rootName }
  );
}

/**
 * Make the next mocked directory-picker call return a named OPFS
 * directory instead of the default `fake-sync` root. This is intentionally
 * one-shot so assertions still name their root explicitly instead of
 * depending on hidden global picker state.
 */
export async function pickSyncRootOnNextPicker(page: Page, rootName: string) {
  await page.evaluate((rootName) => {
    const previousPicker = window.showDirectoryPicker;
    window.showDirectoryPicker = async () => {
      window.showDirectoryPicker = previousPicker;
      window.__miwakeTestDenyFSAccess = false;
      const opfs = await navigator.storage.getDirectory();
      return opfs.getDirectoryHandle(rootName, { create: true });
    };
  }, rootName);
}

/**
 * Copy one OPFS-backed fake sync root into another isolated BrowserContext. This intentionally
 * copies only the sync source, not app-local IDB or localStorage, so the receiving page still
 * behaves like a separate device/profile.
 */
export async function copySyncRoot(
  sourcePage: Page,
  targetPage: Page,
  {
    sourceRootName = DEFAULT_SYNC_ROOT_NAME,
    targetRootName = DEFAULT_SYNC_ROOT_NAME
  }: { sourceRootName?: string; targetRootName?: string } = {}
) {
  const snapshot = await sourcePage.evaluate(
    async ({ sourceRootName }) => {
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
      const root = await opfs.getDirectoryHandle(sourceRootName, { create: true });
      return snapshotDirectory(root);
    },
    { sourceRootName }
  );

  await targetPage.evaluate(
    async ({ snapshot, targetRootName }) => {
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
      const root = await opfs.getDirectoryHandle(targetRootName, { create: true });
      await clearDirectory(root);
      await restoreEntries(root, snapshot);
    },
    { snapshot, targetRootName }
  );
}

export async function denyStoredFSAccessOnNextLoad(page: Page) {
  await page.addInitScript(() => {
    window.__miwakeTestDenyFSAccess = true;
  });
}

export async function failNextSyncRootListing(page: Page, message: string) {
  await page.evaluate((message) => {
    window.__miwakeTestFailNextFSListing = message;
  }, message);
}

export async function setDocumentVisibility(page: Page, state: DocumentVisibilityState) {
  await page.evaluate((state) => {
    window.__miwakeTestSetVisibilityState?.(state);
  }, state);
}

/**
 * Init script: runs in the page before any app code. Patches showDirectoryPicker to return an
 * OPFS-backed handle rooted at /fake-sync, and patches FileSystemDirectoryHandle permission
 * methods to return 'granted' so the app's permission gate is no-op in tests.
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
  // Keep ambient sync assertions fast without changing production debounce timing. This script
  // runs before app modules load, so the sync engine observes the test-only value at startup.
  window.__miwakeTestSyncPushDebounceMs = 50;

  FileSystemDirectoryHandle.prototype.queryPermission = async () =>
    window.__miwakeTestDenyFSAccess ? 'denied' : 'granted';
  FileSystemDirectoryHandle.prototype.requestPermission = async () =>
    window.__miwakeTestDenyFSAccess ? 'denied' : 'granted';

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
  const originalValues = FileSystemDirectoryHandle.prototype.values;
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
  Object.defineProperty(FileSystemDirectoryHandle.prototype, 'values', {
    configurable: true,
    value(this: FileSystemDirectoryHandle) {
      const failureMessage = window.__miwakeTestFailNextFSListing;
      if (!failureMessage) {
        return originalValues.call(this);
      }

      window.__miwakeTestFailNextFSListing = undefined;
      throw new Error(failureMessage);
    }
  });

  window.showDirectoryPicker = async () => {
    // The picker represents the user granting access again. Stored
    // handles can stay denied until this point, but the freshly
    // picked handle should pass the app's permission gate.
    window.__miwakeTestDenyFSAccess = false;
    const opfs = await navigator.storage.getDirectory();
    return opfs.getDirectoryHandle('fake-sync', { create: true });
  };
}
