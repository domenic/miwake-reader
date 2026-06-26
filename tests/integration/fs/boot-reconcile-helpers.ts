import type { Browser, Page, TestInfo } from '@playwright/test';
import { copySyncRoot, newPageInTestContext } from '../helpers/harness.ts';
import {
  expectBooksInManage,
  importBookFixtures,
  type LibraryBookFixture,
  VALID_BOOK
} from '../helpers/fixtures.ts';
import { loadApp } from '../helpers/navigation.ts';
import { connectFS } from '../helpers/workflows.ts';

export async function connectedObserver(
  browser: Browser,
  testInfo: TestInfo,
  sourcePage: Page,
  fixtures: readonly LibraryBookFixture[] = [VALID_BOOK]
) {
  await importBookFixtures(sourcePage, fixtures);
  await connectFS(sourcePage);

  const observer = await newPageInTestContext(browser, testInfo);
  try {
    await loadApp(observer.page);
    await copySyncRoot(sourcePage, observer.page);
    await connectFS(observer.page);
    await expectBooksInManage(observer.page, { placeholders: fixtures, downloaded: [] });
    return observer;
  } catch (error) {
    await observer[Symbol.asyncDispose]();
    throw error;
  }
}
