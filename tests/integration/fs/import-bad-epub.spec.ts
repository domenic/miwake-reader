import { test } from '../helpers/harness.ts';
import {
  expectImportFailedForFixture,
  fixtureDescription,
  importBookFixtures,
  INVALID_IMPORT_BOOKS
} from '../helpers/fixtures.ts';

for (const fixture of INVALID_IMPORT_BOOKS) {
  test(`importing ${fixtureDescription(fixture)} surfaces the import-failed dialog`, async ({
    page
  }) => {
    await importBookFixtures(page, [fixture]);
    await expectImportFailedForFixture(page, fixture);
  });
}
