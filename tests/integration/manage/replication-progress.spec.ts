import type { Page } from '@playwright/test';
import { expect, test } from '../helpers/harness.ts';
import {
  COVER_REFRESH_BOOK,
  expectImportFailedForFixture,
  fixtureTitle,
  INVALID_IMPORT_BOOKS,
  LONG_BOOK,
  PLAIN_TEXT_BOOK,
  startImportBookFixtures,
  type BookFixture
} from '../helpers/fixtures.ts';
import { navigateToManage } from '../helpers/navigation.ts';

interface ProgressObservation {
  value: number;
  max: number;
}

/**
 * Failed imports can advance and remove the progress bar before Playwright gets another browser
 * round trip. Observe value changes in the page so the test can assert that transient UI history.
 */
async function observeReplicationProgress(page: Page) {
  await navigateToManage(page);

  return page.evaluateHandle(() => {
    const observations: ProgressObservation[] = [];

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        const progressBar = mutation.target;
        if (
          progressBar instanceof HTMLProgressElement &&
          progressBar.closest('[title="Cancel operation"]')
        ) {
          observations.push({ value: progressBar.value, max: progressBar.max });
        }
      }
    });

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['value'],
      subtree: true
    });

    return { observations, observer };
  });
}

test('manager shows replication progress while importing books', async ({ page }) => {
  const fixtures: BookFixture[] = [
    COVER_REFRESH_BOOK,
    LONG_BOOK,
    PLAIN_TEXT_BOOK,
    ...Array<typeof LONG_BOOK>(8).fill(LONG_BOOK)
  ];
  await startImportBookFixtures(page, fixtures);

  const progressHeader = page.getByTitle('Cancel operation');
  const progressBar = progressHeader.getByRole('progressbar');
  await expect(progressBar).toBeVisible();
  await expect(progressBar).toHaveJSProperty('max', fixtures.length * 3);
  await expect
    .poll(() => progressBar.evaluate((el) => (el as HTMLProgressElement).value))
    .toBeGreaterThan(0);
  await expect(progressHeader).toContainText(/~ (?:\d{2}:){2}\d{2}/);

  await expect(
    page.getByRole('link', { name: fixtureTitle(COVER_REFRESH_BOOK), exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: fixtureTitle(LONG_BOOK), exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: fixtureTitle(PLAIN_TEXT_BOOK), exact: true })
  ).toBeVisible();
  await expect(progressHeader).toBeHidden();
});

test('manager advances replication progress when imports fail', async ({ page }) => {
  const [invalidFixture] = INVALID_IMPORT_BOOKS;
  const fixtures = Array<typeof invalidFixture>(8).fill(invalidFixture);
  const progressObservation = await observeReplicationProgress(page);

  await startImportBookFixtures(page, fixtures);
  await expectImportFailedForFixture(page, invalidFixture);

  const observations = await progressObservation.evaluate(({ observations, observer }) => {
    observer.disconnect();
    return observations;
  });
  await progressObservation.dispose();
  expect(observations.some(({ value, max }) => value > 0 && max === fixtures.length * 3)).toBe(
    true
  );
});
