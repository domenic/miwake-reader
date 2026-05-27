# Integration test migration tracker

This file is the durable handoff for migrating `~/miwake-harness/` scenarios into the in-tree Playwright suite under `tests/integration/`. Treat `~/miwake-harness/` as read-only reference material until the migration is complete.

## Current State

- Source harness files on disk: 46 numeric FS-ish scenarios (`00-*.mjs` through `46-*.mjs`, with no `25-*`) and 15 `cloud-*.mjs` scenarios.
- In-tree Playwright FS specs: 22 files, 23 tests under `tests/integration/fs/`.
- Test command: `npm run test:integration`.
- Main harness: `tests/integration/helpers/harness.ts`.
- User workflow helpers: `tests/integration/helpers/workflows.ts`.
- Book fixture helpers: `tests/integration/helpers/fixtures.ts`.
- Generated book fixtures: `tests/integration/fixtures/books/*`, produced by `npm run generate-fixtures` / `prepare` and gitignored.
- Last full-suite verification before this tracker update: `npm run test:integration` passed before the latest cross-context additions; focused cross-context/source-placeholder specs and `npm run check` passed afterward.

## Migration Rules

- Prefer UI setup and UI assertions. Do not create test state by manually editing IndexedDB or manufacturing OPFS sync internals when a user-visible workflow can create the state.
- Source contents should usually be created by importing real fixture books through `/manage`, connecting FS sync, and letting the app mirror data to the OPFS-backed sync source.
- Source-only placeholder states should usually be created with `signOutAndWipe()` followed by reconnecting to the same OPFS-backed source.
- Assertions should be against UI-readable state wherever possible. OPFS assertions are acceptable when the behavior under test is that data reached or left the sync source.
- Keep OPFS assertions at the book-folder or root-artifact level unless filename format is truly the behavior under test. Avoid `bookdata_*` / `progress_*` coupling.
- Do not hand-roll `indexedDB.open(...)` or raw OPFS reads in specs. Any unavoidable storage access belongs behind a named helper in `tests/integration/helpers/`.
- Do not add one-off helpers. Promote a helper only when multiple specs use the same workflow or when the helper names a genuinely important test seam.
- Do not use `page.waitForTimeout()` in specs. Prefer web-first assertions, `expect.poll()`, or existing sync helpers.
- Do not commit generated fixtures. EPUB/TXT fixtures under `tests/integration/fixtures/books/` are generated and ignored.
- Do not commit migration work until the user signs off.

## Known Test Seams

- `connectFS(page)` drives Settings -> Sync -> Choose folder and waits for the connected flow.
- `waitForSyncIdle(page)` waits for the bottom-left sync state to report idle. "Connected" only means the source handle/auth flow completed; it does not mean sync work has drained.
- The harness init script sets `window.__miwakeTestSyncPushDebounceMs = 50` before app modules load. Production keeps its normal debounce; Playwright gets faster ambient pushes.
- The app shell is inert until Svelte hydration completes. Treat hydration races as product bugs, not as reasons to add per-button retry loops.
- `importBookFixtures(page, fixtures)` drives the visible `Import Files` button and Playwright file chooser. Do not bypass the UI by setting the hidden input directly.
- `expectBooksVisible()`, `expectBooksAbsent()`, `bookProgressBar()`, `openBookFromManage()`, and `deleteBookFromManage()` are the preferred book-card surface helpers.
- `expectBooksInSyncRoot()` is the preferred source folder assertion for books.
- `copySyncRoot(sourcePage, targetPage)` copies only the OPFS-backed fake sync source between isolated BrowserContexts. It intentionally does not copy IDB or localStorage, so the target still behaves like a separate device/profile.
- `newPageInTestContext(browser, testInfo)` creates an additional isolated BrowserContext with the same harness init scripts and baseURL.
- `forceFullResync(page, direction)` is the normal UI helper for Settings -> Sync -> Force re-sync.
- `forceFullResyncFromSettings(page, direction)` exists for cases already on Settings where navigating would trigger boot reconcile before the test can choose a direction.

## Ported Coverage

| Harness scenario                                      | In-tree coverage                                                                                                                        | Notes                                                                                               |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `00-smoke.mjs`                                        | `fs/smoke.spec.ts`                                                                                                                      | App boots and picker mock returns the fake source root.                                             |
| `01-fs-empty.mjs`                                     | `fs/fs-empty.spec.ts`                                                                                                                   | Empty sync folder connects and leaves library empty.                                                |
| `02-fs-with-books.mjs`                                | `fs/source-placeholder-varied-and-corrupt.spec.ts`                                                                                      | Covered via UI-created multiple source books with 0%, partial, and completed progress.              |
| `03-open-placeholder.mjs`                             | `fs/source-only-placeholder.spec.ts`, `fs/source-placeholder-varied-and-corrupt.spec.ts`                                                | Placeholder open/download and corrupt-source error UI are covered through fresh-device flows.       |
| `04-disconnect.mjs`                                   | `fs/disconnect-no-wipe-drops-placeholders.spec.ts`, `fs/disconnect-no-wipe-keeps-downloaded.spec.ts`, `fs/disconnect-with-wipe.spec.ts` | Split by placeholder, downloaded book, and wipe behavior.                                           |
| `05-reconcile-on-boot.mjs`                            | `fs/cross-context-source-reconcile.spec.ts`                                                                                             | Reload/boot reconcile picks up another context adding a book.                                       |
| `06-bookmark-refresh.mjs`                             | `fs/cross-context-source-reconcile.spec.ts`, `fs/source-placeholder-varied-and-corrupt.spec.ts`                                         | Reload/fresh-device flows pick up completed and partial progress.                                   |
| `07-signout-wipe.mjs`                                 | `fs/signout-wipe.spec.ts`                                                                                                               | Wipe clears local library and sync connection.                                                      |
| `08-force-resync.mjs`                                 | `fs/force-resync.spec.ts`                                                                                                               | Keep-newest happy path keeps a downloaded book available.                                           |
| `09-prune-unreachable-on-boot.mjs`                    | `fs/cross-device-delete-prunes-downloaded.spec.ts`, `fs/cross-context-source-reconcile.spec.ts`                                         | Boot reconcile prunes deleted source books.                                                         |
| `10-force-resync-remote-only.mjs`                     | `fs/cross-context-source-reconcile.spec.ts`                                                                                             | Manual source-wins force re-sync picks up source-side additions.                                    |
| `15-disconnect-with-wipe.mjs`                         | `fs/disconnect-with-wipe.spec.ts`                                                                                                       | Downloaded book unlocks wipe affordance naturally.                                                  |
| `18-ambient-push-on-bookmark.mjs`                     | `fs/cross-context-source-reconcile.spec.ts`, `fs/source-placeholder-varied-and-corrupt.spec.ts`                                         | Progress pushes are covered via real reader bookmark/completion workflows, not filename inspection. |
| `20-ambient-push-on-import.mjs`                       | `fs/ambient-push-on-import.spec.ts`                                                                                                     | Import while connected pushes book folder to source.                                                |
| `21-ambient-push-on-backup-import.mjs`                | `fs/backup-import-ambient-push.spec.ts`                                                                                                 | Backup restore while connected pushes restored book to source.                                      |
| `22-app-settings-backup-restore.mjs`                  | `fs/backup-app-settings.spec.ts`                                                                                                        | Backup import restores app settings after wipe.                                                     |
| `24-import-bad-epub-error-dialog.mjs`                 | `fs/import-bad-epub.spec.ts`                                                                                                            | Covers both not-a-zip and zip-without-EPUB-structure failures.                                      |
| `33-cross-device-book-deletion-prunes-downloaded.mjs` | `fs/cross-device-delete-prunes-downloaded.spec.ts`                                                                                      | Downloaded book deleted from source is pruned on boot.                                              |
| `35-local-wins-resync-restores-deleted-remote.mjs`    | `fs/local-wins-resync-restores-source.spec.ts`                                                                                          | "This device wins" restores a missing source book.                                                  |
| `36-disconnect-no-wipe-keeps-downloaded.mjs`          | `fs/disconnect-no-wipe-keeps-downloaded.spec.ts`                                                                                        | Disconnect without wipe keeps downloaded books.                                                     |
| `38-reading-goals-pushed-without-books.mjs`           | `fs/reading-goals-without-books.spec.ts`                                                                                                | Empty-library reading goals push and restore.                                                       |
| `39-up-only-boot-keeps-local-books.mjs`               | `fs/up-only-boot-keeps-local-books.spec.ts`                                                                                             | Up-only boot does not let missing source listing prune local books.                                 |
| `42-down-only-delete-book-local-only.mjs`             | `fs/down-only-delete-local-only.spec.ts`                                                                                                | Down-only delete is local-only.                                                                     |
| `43-off-delete-book-local-only.mjs`                   | `fs/off-delete-local-only.spec.ts`                                                                                                      | Sync-off delete is local-only.                                                                      |
| `46-tracker-toggle-autoresumes-after-tab-return.mjs`  | `fs/tracker-toggle-auto-resume.spec.ts`                                                                                                 | Tracker pause bookkeeping survives tab hide/show.                                                   |

## Partial Coverage

| Harness scenario                  | Covered part                                                             | Missing part                                                                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `11-prune-cascades.mjs`           | Source deletion/pruning is covered.                                      | The old `lastItem` cascade assertion is not directly covered. Prefer a UI-observable resume/last-book assertion if this is still valuable.            |
| `17-force-resync-local-wins.mjs`  | Local-wins restoring a deleted source book is covered.                   | Local progress winning over newer source progress is not covered. Build this through two contexts if possible, not by editing `progress_*` filenames. |
| `19-force-resync-corrupt-zip.mjs` | Corrupt source file opening and connected-sync error branch are covered. | Force re-sync showing a sync-failed status while keeping the source/placeholder intact is not covered.                                                |
| `23-open-placeholder-no-sync.mjs` | The sync-connected placeholder branch is covered.                        | The no-sync placeholder state is stale/manufactured. Treat as D-class unless there is a supported UI path to create it.                               |

## Uncovered FS / Numeric Harness Scenarios

These remain to port, drop, or explicitly classify.

| Harness scenario                                         | Behavior to preserve                                                                          | Recommended approach                                                                                                                               |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `12-change-folder.mjs`                                   | Changing from one FS source to another preserves connection and reconciles the new listing.   | Pair with `34` and `41`; likely needs a helper that models a different source instance without direct IDB edits.                                   |
| `13-force-resync-prunes.mjs`                             | Force re-sync prunes source-deleted placeholders without reload.                              | Likely already covered by `cross-context-source-reconcile.spec.ts`; decide whether to mark covered or add a narrow placeholder-specific assertion. |
| `14-switch-listing-fails.mjs`                            | Failed folder switch does not tear down the prior source.                                     | Needs a controlled failure seam. Prefer app/harness seam over monkey-patching storage handler internals in a spec.                                 |
| `16-cover-refresh.mjs`                                   | Placeholder cover refresh updates stored/rendered cover when source cover changes.            | Needs a fixture with a cover and a UI-readable cover assertion. Avoid pixel sampling unless there is no better user-visible assertion.             |
| `26-reconnect-preserves-oauth-mode.mjs`                  | Reconnect does not silently switch between default and custom OAuth modes.                    | Numeric file, but cloud/OAuth behavior; defer to cloud/fake-cloud work.                                                                            |
| `27-force-resync-remote-wins-overwrites-newer-local.mjs` | "Sync location wins" overwrites newer local book data.                                        | Needs a user-level way to create a newer local version or a deliberate helper seam for metadata; avoid raw IDB timestamp pokes if possible.        |
| `28-zip-wins-overwrites-newer-local.mjs`                 | Backup import "ZIP wins" overwrites newer local book data.                                    | Same tension as `27`; maybe best as a lower-level unit/integration test if UI cannot create distinguishable book metadata.                         |
| `29-onedrive-custom-rt-refresh-sends-secret.mjs`         | Custom OneDrive refresh sends `client_secret`.                                                | Numeric file, but cloud/OAuth behavior; defer to fake-cloud or focused storage-oauth test.                                                         |
| `30-zip-wins-drops-local-only-stats.mjs`                 | Backup import "ZIP wins" drops local-only statistics.                                         | Prefer using tracker/statistics UI to create stats, then backup import UI.                                                                         |
| `31-force-resync-remote-wins-drops-local-only-stats.mjs` | "Sync location wins" drops local-only statistics.                                             | Prefer two-context source copy plus statistics UI; avoid direct stat-row planting if possible.                                                     |
| `32-newest-import-preserves-timestamp-protection.mjs`    | Backup import "Keep newest" preserves newer local data despite ambient prefs.                 | May require a targeted non-UI test if there is no UI for the ambient pref.                                                                         |
| `34-change-folder-keeps-library.mjs`                     | Changing to an empty FS folder keeps local books and mirrors them to the new source.          | Pair with `12`; assert library UI plus source folder contents.                                                                                     |
| `37-backfill-source-instance-id.mjs`                     | Pre-refactor `lastSeenOnSource` rows migrate to `lastSeenSourceInstanceId`.                   | Historical migration test; likely needs direct IDB setup or should be dropped if old DB versions are no longer supported.                          |
| `40-keep-newest-import-uses-goal-timestamp.mjs`          | Backup import "Keep newest" uses reading-goal timestamp, not mere key presence.               | Can probably be UI-driven with two backup/goal states if timestamps can be ordered deterministically.                                              |
| `41-same-fs-regrant-prunes-downloaded.mjs`               | Re-granting the same FS source keeps source identity stable and preserves deletion semantics. | Pair with `12`/`34`; may need harness support for permission revocation/regrant.                                                                   |
| `44-statistics-page-delete-propagates-fs.mjs`            | Deleting all statistics from `/statistics` propagates to the source.                          | Use real statistics UI and source folder/root assertions.                                                                                          |
| `45-pending-stat-push-canceled-on-book-delete.mjs`       | Deleting a book cancels already-debounced per-book statistics pushes.                         | Use test debounce seam; create a stat through UI, delete before push drains, assert source book folder stays absent.                               |

## Recommended Next Batch

Start with source switching/regrant behavior:

- `12-change-folder.mjs`
- `14-switch-listing-fails.mjs`
- `34-change-folder-keeps-library.mjs`
- `41-same-fs-regrant-prunes-downloaded.mjs`

These share the same conceptual surface: changing or regranting an FS source must not corrupt local/source identity. Work out one clean helper story for switching/regranting rather than solving each file separately.

After that, the statistics cluster is a good batch:

- `30-zip-wins-drops-local-only-stats.mjs`
- `31-force-resync-remote-wins-drops-local-only-stats.mjs`
- `44-statistics-page-delete-propagates-fs.mjs`
- `45-pending-stat-push-canceled-on-book-delete.mjs`

## Cloud / OAuth Work

The in-tree suite does not yet have cloud projects. Numeric scenarios `26` and `29` are really cloud/OAuth tests and should move with the cloud work, not the FS batch.

Future cloud plan:

- Add `tests/integration/cloud/` specs tagged/projected so real-cloud runs are opt-in locally/nightly.
- Add a fake-cloud helper served through `context.route()` for PR-safe Google Drive / OneDrive behavior.
- Mock OAuth popup completion by intercepting the app's popup auth boundary and synthesizing the BroadcastChannel success message.
- Keep real-cloud refresh token fixtures under `tests/integration/cloud/.auth/` and gitignored.
- Use per-run storage root names for real cloud to avoid concurrent run collisions.

## Audit Template

Use this before porting a remaining harness scenario.

```md
### NN — descriptive name

- Class: A pure UI | B planted setup + UI assert | C storage-asserted with reason | D drop
- Behavior protected:
- Setup path:
- Primary UI assertion:
- Secondary storage assertion:
- Harness shortcuts to remove:
- Fixture needs:
- New spec path:
- Drop rationale, if D:
```
