# Integration test guidance

The in-tree integration suite should exercise the app through user-visible workflows by default. Storage access is still useful for sync-source setup and assertions, but specs should not manufacture app state directly when the UI can create that state.

## Running

- `npm test` runs the integration suite.
- `npm run generate-fixtures` rebuilds generated book fixtures; `prepare` runs it automatically.
- Generated EPUB/TXT fixtures under `tests/integration/fixtures/books/` are gitignored and should not be committed.

## Writing Specs

- Import `test` and `expect` from `tests/integration/helpers/harness.ts`, not directly from `@playwright/test`, so the OPFS-backed directory picker and hydration test setup are installed.
- Prefer UI setup and UI assertions. Do not hand-roll `indexedDB.open(...)` or raw OPFS reads in specs.
- Put unavoidable storage access behind a named helper in `tests/integration/helpers/`.
- Create source contents by importing real fixture books through `/manage`, connecting FS sync, and letting the app mirror data to the OPFS-backed sync source.
- Create source-only placeholder states with `signOutAndWipe()` followed by reconnecting to the same OPFS-backed source.
- Assert `/manage` state with `expectBooksInManage(page, { placeholders, downloaded })`; both arrays are required, and any fixture not listed is expected to be absent.
- Assert book folders in a sync source with `expectBooksInSyncRoot()`. Avoid coupling tests to `bookdata_*`, `progress_*`, or other internal filenames unless the filename is the behavior under test.
- Use OPFS assertions only when the behavior under test is that data reached or left the sync source.
- The app shell is inert until Svelte hydration completes. Treat hydration races as product bugs, not as reasons to add per-button retry loops.
- Do not use `page.waitForTimeout()` in specs. Prefer web-first assertions, `expect.poll()`, or existing sync helpers.
- Add a helper only when multiple specs use the same workflow or when the helper names a genuinely important test seam.

## Sync Roots

The mocked directory picker defaults to the OPFS directory named `fake-sync`. Helpers that operate on fake sync roots take a `rootName` option; tests involving multiple fake folders should pass explicit names instead of relying on hidden global state.
