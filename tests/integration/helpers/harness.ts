import { test as base, expect } from '@playwright/test';

export { expect };

/**
 * Extended Playwright test with the OPFS-backed showDirectoryPicker mock installed via
 * context.addInitScript. Tests should import `test` and `expect` from this module instead of
 * `@playwright/test`.
 */
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.addInitScript(pickerInitScript);
    await use(context);
  }
});

/**
 * Init script: runs in the page before any app code. Patches showDirectoryPicker to return an
 * OPFS-backed handle rooted at /fake-sync, and patches FileSystemDirectoryHandle permission methods
 * to return 'granted' so the app's permission gate is no-op in tests.
 *
 * showDirectoryPicker isn't driveable from Playwright (user-gesture-gated with native chrome).
 * FileSystemDirectoryHandle is structurally identical whether it comes from the picker or from
 * navigator.storage.getDirectory, so substituting an OPFS handle gives the app a fully-functional
 * filesystem to write to without any picker UI.
 */
function pickerInitScript() {
  FileSystemDirectoryHandle.prototype.queryPermission = async () => 'granted';
  FileSystemDirectoryHandle.prototype.requestPermission = async () => 'granted';

  window.showDirectoryPicker = async () => {
    const opfs = await navigator.storage.getDirectory();
    return opfs.getDirectoryHandle('fake-sync', { create: true });
  };
}
