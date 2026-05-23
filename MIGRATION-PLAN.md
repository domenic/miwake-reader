# Integration test migration plan

Bringing the `~/miwake-harness/` integration scenarios in-tree as a Playwright Test suite that runs in CI. This file is the source of truth; conversation context may be lost to compaction.

## Goals

- Convert the 64 scenarios in `~/miwake-harness/` into in-tree Playwright Test specs.
- Replace hand-rolled runner machinery with `@playwright/test`.
- Run the FS subset on every PR; run the cloud subset under a fake cloud in PR CI and against real Google Drive / OneDrive on a nightly schedule.
- Audit each scenario during conversion: prefer UI assertions over IDB/OPFS dumps, eliminate `console.log` and explicit screenshots, eliminate gratuitous `waitForTimeout`s.

## Source state

- 64 scenarios in `~/miwake-harness/`: 47 FS-only (`NN-*.mjs`), 17 cloud (`cloud-*.mjs`).
- 213 `waitForTimeout` calls across the suite. Most are arbitrary; many wait for the sync engine's 5s push debounce.
- ~34/64 scenarios dump IDB or OPFS for assertions. ~59/64 also use locators.
- Harness machinery: `harness.mjs` (~204 lines), `harness-cloud.mjs` (~482 lines), `setup-cloud-fixture.mjs` (~107 lines).
- `~/miwake-harness/sysroot/` carries pinned Chromium runtime libs because the laptop didn't have sudo at harness-writing time.
- `~/miwake-harness/.auth/` carries refresh-token fixtures for real-cloud runs; gitignored, mode 0600.
- Current project CI (`.github/workflows/ci.yml`) runs lint, format, types, build only — no tests.
- EPUB fixtures referenced from harness: `/tmp/わたし、定時で帰ります。.epub` (743KB, copyrighted-looking Japanese title) and `/tmp/not-actually-an-epub.epub` (37 bytes).

## Decisions locked in

| Question                  | Decision                                                            | Why                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework                 | `@playwright/test`                                                  | Already using Playwright; the runner gives parallel/retries/traces/fixtures/web-first assertions for free. Testing Library is the wrong shape (component-test toolkit).                                                                                                                                                                                                                                                                                              |
| Location                  | `tests/integration/` at repo root, no numeric prefixes              | Numbers are chronological-not-semantic; group by feature via subdirectory + `describe()`.                                                                                                                                                                                                                                                                                                                                                                            |
| Cleanup posture           | Drop `console.log`s and explicit `shot()` calls                     | `screenshot/video/trace` only-on-failure; traces already capture console/pageerror for forensics. No strict console-error fixture for Phase 1 — the app's error-logging shape is unknown and an allowlist would be guesswork; revisit in Phase 2 if a regression class emerges that strict checking would catch.                                                                                                                                                     |
| Sysroot                   | Delete                                                              | Local: `sudo npx playwright install-deps chromium` once. CI: `npx playwright install --with-deps chromium`.                                                                                                                                                                                                                                                                                                                                                          |
| EPUB fixtures (all cases) | Hand-authored synthetic EPUBs, generated on `npm install`           | Revised from initial plan: Aozora Bunko serves `.txt`, not EPUBs, and third-party EPUB conversions each carry licensing wrinkles. `scripts/generate-test-fixtures.mjs` builds the EPUBs (CC0 by construction); the existing `prepare` script invokes it so a clean `npm install` populates `tests/integration/fixtures/books/`. The fixtures themselves are gitignored. `npm run generate-fixtures` regenerates on demand. Tests reference paths, not builder calls. |
| Audit cadence             | Batch-by-batch during conversion (~8–12 scenarios per PR)           | Faster feedback than a 64-row upfront spreadsheet; smaller reviews.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Sync debounce in tests    | Defer the design decision to Phase 2                                | After Batch 1, if the 5s push debounces dominate runtime, choose between (a) env-driven debounce override, (b) test-only `syncEngine.idle$` observable, or (c) UI-proxy polling per test.                                                                                                                                                                                                                                                                            |
| Cloud-in-CI posture       | Hybrid: fake cloud in PR CI (Phase 4), real cloud nightly (Phase 5) | PR CI deterministic and secret-free; nightly catches real-API drift.                                                                                                                                                                                                                                                                                                                                                                                                 |
| Browser projects          | Chromium only initially                                             | Add Firefox/WebKit later once the suite is stable.                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Dev server for tests      | `npm run dev` locally, `npm run preview` in CI                      | CI tests what users ship; local iteration stays fast. `webServer: { reuseExistingServer: !process.env.CI }` covers both.                                                                                                                                                                                                                                                                                                                                             |
| Component tests           | Out of scope for this plan                                          | If we want component-level tests later, `@testing-library/svelte` + Vitest is the right tool. Not for these integration scenarios.                                                                                                                                                                                                                                                                                                                                   |

## Target tree

```
tests/integration/
  fixtures/
    books/
      valid-japanese.epub           # generated by `prepare`, gitignored
      malformed.epub                # generated by `prepare`, gitignored
  helpers/
    harness.ts                      # test extension with picker mock; storage/sync helpers ported back as Phase 2 needs them
    harness-cloud.ts                # Phase 3: loadCloudFixture, plantCloudFixture, rotateCloudFixture, provider API helpers
    fake-cloud.ts                   # Phase 4: in-process GDrive/Graph mock served via context.route
    pages/                          # Phase 2: only if locator duplication justifies it
  fs/
    smoke.spec.ts
    fs-empty.spec.ts
    fs-with-books.spec.ts
    ...                             # ~47 specs converted from NN-*.mjs
  cloud/
    connect-gdrive.spec.ts
    ...                             # ~17 specs converted from cloud-*.mjs; tagged @cloud
scripts/
  generate-test-fixtures.mjs        # builds EPUB fixtures; invoked from `prepare`
playwright.config.ts
```

Test specs must not hand-roll `indexedDB.open(...)` or OPFS reads. All storage access goes through `helpers/harness.ts`.

## Playwright config

The live config lives in `playwright.config.ts`. Phase 1 keeps it minimal — one implicit project under `tests/integration/`, no `projects:` array.

Cloud projects (`cloud-mock`, `cloud-real`) get added when Phase 3 / 4 land actual cloud specs. Shape at that point:

- `cloud-real`: `fullyParallel: false`, `workers: 1`, requires `.auth/` fixtures present locally, skipped in PR CI.
- `cloud-mock`: same testDir, uses `context.route()` for the in-process fake cloud, runs in PR CI.

`package.json` script (Phase 1): `"test:integration": "playwright test"`. Add `test:integration:cloud-real` (and possibly `:cloud-mock`) when those projects exist.

## `waitForTimeout` removal policy

- Default rule: no `page.waitForTimeout()` in specs.
- Replacements:
  - UI settling: `await expect(locator).toBeVisible({ timeout })`, `toHaveText`, `toHaveCount`.
  - Storage settling: `await expect.poll(() => readState()).toEqual(...)` using helpers.
  - Network settling: `page.waitForResponse(...)` or fake-cloud request assertions.
  - Sync engine background work: TBD in Phase 2 (debounce override, idle observable, or UI proxy).
- Any surviving `waitForTimeout` must (a) live in one named helper, not inline in tests, and (b) have a comment naming the specific event being waited for and why no observable proxy exists.

## Phase 0 — prerequisites

Status checkboxes; tick as completed.

- [x] User runs `sudo npx playwright install-deps chromium` locally.
- [x] **Bug 1 from REPORT.md is moot.** The architecture changed substantially. The old `pruneUnreachablePlaceholders` in `sync-engine.ts:219` no longer exists. The current flow is `placeholder-reconciler.ts:228` → `deleteMatchingBooks` → `database.deleteData` (`database.service.ts:273`), and that single deletion path explicitly handles bookmarks (passes `bookmarkIds` as context to `deleteSingleData`).
- [x] **Bug 2 from REPORT.md is fixed.** `backup-service.ts:369` `wipeAllStorage()` clears stores in a single transaction instead of calling `deleteDatabase`. The comment at lines 362-367 narrates the exact race that the report flagged.
- [x] EPUB fixture: decision revised — hand-authored synthetic EPUBs (see Decisions table). Builder lands in Phase 1.
- [x] `VITE_STORAGE_ROOT_NAME` confirmed in `src/lib/data/env.ts:5` (read by `storageRootName` export, used by `base-handler.ts:104`).
- [x] No sync idle observable exists today. Defer the Phase 2 design choice (env-driven debounce override vs. add `syncEngine.idle$` vs. UI-proxy polling).

## Phase 1 — scaffolding (one PR, no scenario conversions)

- Add `@playwright/test` to `devDependencies`.
- Add `playwright.config.ts` per the section above. No `projects:` array in Phase 1 — added in Phase 3 / 4 when cloud specs land.
- Port `harness.mjs` → `tests/integration/helpers/harness.ts` (TypeScript, exports as both standalone utilities and Playwright fixtures).
- No strict console/pageerror fixture for Phase 1. Playwright traces already capture console output and uncaught exceptions; we rely on traces for forensics when other assertions fail. Revisit during Phase 2 if a regression class emerges that strict checking would catch.
- Add `tests/integration/fs/smoke.spec.ts` — equivalent of `00-smoke.mjs`, exercising the picker mock + app boot.
- Add `package.json` script (`test:integration`). Add cloud variants in Phase 3 / 4.
- Extend `.github/workflows/ci.yml` with a job that:
  - `actions/cache`s `~/.cache/ms-playwright`.
  - Runs `npx playwright install --with-deps chromium`.
  - Runs `npm run test:integration` (i.e., the `fs` project).
  - Uploads `playwright-report/` and `test-results/` as artifacts on failure.

Acceptance: smoke spec passes locally and in CI. No other behavior changes.

## Phase 2 — FS scenario migration, batches of 8–12

For each scenario in a batch, fill in the audit worksheet (next section), then convert.

Conversion rules:

- `console.log` removed entirely; failure diagnostics via the HTML reporter and trace viewer.
- Explicit `shot()` calls removed; rely on `screenshot: 'only-on-failure'`.
- `waitForTimeout` per the removal policy above.
- IDB/OPFS dumps replaced with UI assertions wherever feasible; remaining state assertions go through `helpers/harness.ts`, never raw `indexedDB.open()` in the spec.
- Long scenarios broken into `await test.step('name', async () => { ... })` blocks for trace readability.
- Per-test temp paths via `testInfo.outputPath(...)` — not hardcoded paths.

Each batch PR description includes:

- The seven-field audit row per scenario.
- A/B/C/D classification per scenario.
- Any scenarios dropped (D-class) with explicit rationale.
- Any surprises or learnings that change the plan.

After Batch 1, decide the sync-debounce question (see Decisions table).

Estimate: 5 batches for 47 FS scenarios. PR cadence depends on review velocity.

## Phase 3 — cloud scenarios, local-only

- Port cloud scenarios under `tests/integration/cloud/`, tagged `@cloud-real` so they run only under the `cloud-real` project.
- Same audit/conversion discipline as Phase 2.
- `cloud-real` project requires `.auth/` fixtures present locally; CI skips this project at the workflow level.
- Document the `setup-cloud-fixture.mjs` flow in `tests/integration/cloud/README.md` (port from `~/miwake-harness/CLOUD-OAUTH-PLAN.md`).
- Add `tests/integration/cloud/.auth/` to `.gitignore` if not already covered by a broader rule.

## Phase 4 — mock-mode cloud in PR CI

- Implement `tests/integration/helpers/fake-cloud.ts`: in-process FakeCloud served via `context.route()`. Mocks:
  - `https://oauth2.googleapis.com/token` and `https://login.microsoftonline.com/consumers/oauth2/v2.0/token` — fake refresh + access tokens, optional rotation toggle for testing rotation handling.
  - `https://www.googleapis.com/drive/v3/...` and `https://graph.microsoft.com/v1.0/me/drive/...` — list/get/upload/delete against an in-process file tree.
- Mock OAuth popup: intercept `StorageOAuthManager.createWindow`, synthesize the BroadcastChannel auth-success message.
- The `cloud-mock` project runs the same `.spec.ts` files as `cloud-real`, differentiated by project config injecting the fake-cloud routes.
- Specs that test pure-server behavior (rotation handling, retry on 503, etc.) get `@mock-only` or `@real-only` tags as needed.
- Wire `cloud-mock` into the PR CI workflow.

## Phase 5 — nightly real-cloud workflow

- New workflow `.github/workflows/cloud-nightly.yml`. Schedule: `cron: '17 4 * * *'` (or chosen quiet time).
- Secret storage strategy (decide one before implementation):
  - **Preferred: external secret store** (1Password Connect, GCP Secret Manager, Azure Key Vault, or Doppler). CI fetches RTs at job start; post-test, writes rotated RTs back. Cleanest separation, designed for this case.
  - **Alternative: self-hosted runner** with persistent encrypted `.auth/` on disk. Simpler operationally if a runner is already available; ties the workflow to that machine.
  - **Last resort: GitHub Secrets + PAT with `actions:write`** writing rotated RTs back via `gh api`. Works but fragile — a crash between RT use and write-back can desync.
- Materialize `.auth/<sourceName>.json` on the runner from the secret store, run `npm run test:integration:cloud-real`, write any rotated RTs back to the secret store on success or rotation-detected.
- Per-run isolation: set `VITE_STORAGE_ROOT_NAME=Miwake Reader CI ${{ github.run_id }}-${{ github.run_attempt }}` (or equivalent) so concurrent / retried runs don't trample each other in the test account. This obviates needing to serialize cloud-real beyond the per-project `workers: 1`.
- Pre-test: `gdriveResetTestAccount` / `onedriveResetTestAccount` cleanup, scoped to the run-specific root folder.
- Post-test: same cleanup, plus RT rotation write-back.
- On RT-expired error (`AADSTS70000`, GDrive `invalid_grant`), fail the workflow loudly with a runbook link to re-bootstrap via `setup-cloud-fixture.mjs`.
- Workflow does not run on fork PRs (no secrets exposed there anyway).

## Per-scenario audit worksheet

Fill this in for each scenario in a Phase 2 / Phase 3 batch PR.

```
### NN — <descriptive name>

- **Class**: A pure UI | B planted setup + UI assert | C state-asserted with reason | D drop
- **Behavior protected**: <one-sentence user-visible behavior>
- **Setup path**: UI flow / OPFS seed / IDB seed / cloud seed / combination
- **Primary assertion (UI)**: <selector + expected state>
- **Secondary assertion (storage)**: <only if class C; rationale required>
- **Sleeps to remove**: <list waitForTimeout sites and their replacements>
- **Fixture dependency**: real EPUB / synthetic EPUB / none / specific title needed (with reason)
- **Human review needed**: yes / no — <reason if yes>
- **New spec path**: tests/integration/<area>/<name>.spec.ts
```

D-class drops require an explicit rationale: covered by which other spec, or ratified what bug now fixed, or obsoleted by what refactor.

## Open questions that may surface during execution

- Does `src/lib/data/env.ts` actually read `VITE_STORAGE_ROOT_NAME`? If the env var name differs, Phase 5 isolation needs the correct name.
- Does the sync engine expose any "idle" or "settled" signal today? Determines whether Phase 2 needs to add one.
- Does `StorageOAuthManager.createWindow` have a hook that's easy to intercept from a Playwright init script? Determines Phase 4 mock-popup difficulty.
- Are there any tests that genuinely need a second browser context (e.g., cross-tab IDB lock scenarios)? If so, the Phase 1 fixture model needs to accommodate.
- License of the chosen Aozora Bunko EPUB — confirm public domain / CC0 / explicit permissive license; record in `tests/integration/fixtures/books/README.md`.

## What lands when

| Phase | Output                                                 | Land target          |
| ----- | ------------------------------------------------------ | -------------------- |
| 0     | This file + Phase 0 checklist completion               | Already (this PR)    |
| 1     | Scaffolding + smoke spec + CI wiring                   | One PR               |
| 2     | 47 FS specs converted                                  | ~5 PRs               |
| 3     | 17 cloud specs converted (local-only)                  | 1–2 PRs              |
| 4     | FakeCloud + cloud-mock in PR CI                        | 1 PR                 |
| 5     | Nightly real-cloud workflow + secret-store integration | 1 PR (+ infra setup) |

## Handoff notes (for resuming after compaction)

When resuming this work:

1. Read this file first. It is the source of truth.
2. Check Phase 0 status — what's done, what's pending.
3. Read the "Work log" section below — accumulated learnings should be applied to every new batch.
4. Find the most recent batch PR (if any) to see the current audit-worksheet style and pick up where it left off.
5. The original harness at `~/miwake-harness/` is the reference for what each scenario does. Don't modify it; treat it as read-only source material until all scenarios are migrated, then archive it.
6. The Bug 1 verification in Phase 0 matters: if it isn't actually fixed in main, scenario 4 conversion will fail until it is.

## Work log

Learnings carried forward from each batch. Future batches should apply these by default.

### Batch 1 (Phase 2) — fs-empty, import-bad-epub × 2, disconnect-no-wipe × 2

- **Svelte hydration race**: any spec driving a `use:`-bound element (file input via `use:inputFile`, action-attached buttons, etc.) must wait for hydration before the interaction. `setInputFiles` fired before the action attaches dispatches a `change` event into the void. Anchor on an interactive UI element first (e.g. `await expect(page.getByText('Drop files…')).toBeVisible()`) before driving the input.
- **"Connected" is not "settled"**: the Connected badge fires after the OAuth/handle handshake but before the sync engine reconciles. The bottom-left indicator's `/^Synced/` label is the actual engine-idle signal. Any spec whose post-condition depends on sync having drained should wait for `page.getByRole('button', { name: /^Synced/ })`. Currently costs ~5–6s per wait; the Phase 2 design decision (env-driven debounce override vs. `syncEngine.idle$` observable vs. UI-proxy polling) becomes pressing as batches accumulate.
- **Prefer user-visible behavior over wire-format coupling**: planting OPFS files via `bookdataName(...)`/`progressName(...)` couples the test to the sync layer's filename schema. Drive setup through the UI (import an EPUB, let the sync engine populate OPFS); assert through what users see (book card on `/manage`, empty-state text, etc.). When a test truly needs a placeholder (a source-only book the device hasn't downloaded), use sign-out-and-wipe to clear local IDB while OPFS persists — that simulates a "fresh second device pointing at the same source" without any format knowledge in the test. Slower, but format-agnostic.
- **Parameterize over distinct failure shapes**: when porting a spec that exercises one error mode, look for adjacent ones worth covering in the same file. E.g., malformed-EPUB has two natural shapes (not-a-zip, zip-without-EPUB-structure) and they're trivially parameterized in one `for` loop over a `cases` array. Cheaper than one spec per shape.
- **Verify bug hypotheses before recording them**: a test failure has many possible causes (hydration race, selector mismatch, timing, real bug). My initial "valid-zip-bad-mimetype silently drops" claim was a misread of a hydration-race failure. Reproduce with a clean known-good setup before reporting a bug; don't pattern-match from a failed assertion.
- **Locator scoping for dialogs**: `page.locator('dialog[open]').getByRole('button', { name: '…' })` is unambiguous even when the same button label appears on the page behind the modal. Avoid `.last()` tricks — they encode DOM ordering assumptions that aren't stable.
- **`page.waitForURL` accepts globs but bare strings are cleaner**: `waitForURL('/')` resolves against `baseURL` and matches exactly. Glob `'**/'` works but reads as "any URL ending in slash" — confusing intent.
- **Tests are context-isolated**: each test gets a fresh `BrowserContext`, so OPFS / IDB / localStorage all start empty. Don't add defensive clears at the start of each spec. (Confirmed empirically: parallel tests don't trample.)
- **Helpers earn their place with multiple consumers**: removed `importBook`, `bookdataName`, `progressName`, `plantOPFS` because each had only one or zero callers. Add helpers back when ≥2 specs share a common pattern, not before.
- **The picker init script handles directory creation lazily**: calling `plantOPFS(page, [])` is a no-op — `showDirectoryPicker` already does `getDirectoryHandle('fake-sync', { create: true })` on click.

### Batch 2 (Phase 2) — signout-wipe, ambient-push-on-import, force-resync

- **Shared helper threshold reached**: `connectFS`, `waitForSyncIdle`, `importFiles`, `importValidBookFixture`, and `listSyncRoot` now have multiple consumers. Keep sync-folder setup and OPFS reads centralized in `tests/integration/helpers/harness.ts` instead of repeating inline locator/timing code in specs.
- **Synthetic EPUB has no cover**: `valid-japanese.epub` currently proves bookdata replication but not cover replication. Do not assert `cover_*` files from this fixture unless the generator changes to include a cover.
- **Storage assertions stay narrow**: ambient push specs use OPFS only because the user-visible library card cannot prove the sync-folder write happened. Assert sync-root book folders, not internal `bookdata_*` / `progress_*` filenames, unless the filename schema is the behavior under test.

### Batch 3 (Phase 2) — backup app settings, backup import push

- **Backup flows can stay fully UI-driven**: export/import backup specs use the real dialogs and `testInfo.outputPath(...)` downloads. No `/tmp` paths or hand-built ZIP fixtures are needed.
- **Use app wipe as fresh-device setup when it is part of the user model**: backup restore specs reset between export and import through the same Sign out and wipe flow users see, which keeps setup independent from IndexedDB/localStorage internals.
- **Drop stale-state-only scenarios unless they protect a supported recovery path**: scenario 23 (`open-placeholder-no-sync`) requires manufacturing a placeholder row with no sync location. Current normal UI flows prune or block that state, but defensive/boot-race states still make the reader branch plausible. Treat the scenario as D-class for migration rather than codifying stale-state setup in the integration suite.

### Batch 4 (Phase 2) — sync direction policies

- **Drive sync direction through the settings UI**: `setSyncDirection()` opens Settings → Sync and checks the radio for Up only, Down only, or Off. Specs should not set `localStorage.autoReplication` directly.
- **Assert source presence at the book-folder level**: direction-policy specs use `listSyncRoot()` and assert the book-title directory exists or is absent. They intentionally avoid `bookdata_*` filename coupling.
- **Update stale scenario expectations against current product behavior**: scenario 39's old harness expected a whole-library upward mirror on every boot. Commit `55cf3d6` intentionally removed that boot push to reduce noisy sync activity, so the migrated spec keeps the important Up-only guarantee — a missing source copy does not prune the local book — without asserting an immediate re-push.

### Batch 5 (Phase 2) — cross-device delete and local-wins resync

- **Simulate source-side deletion at the book-folder boundary**: specs remove the title directory from the OPFS-backed sync root, then assert UI behavior and root entries. They do not inspect or fabricate `bookdata_*` internals.
- **Use force re-sync through shared UI helpers**: `forceFullResync()` is the normal workflow helper and navigates to Settings → Sync. `forceFullResyncFromSettings()` is the route-local helper for source-deletion tests that must avoid a reload-triggered boot reconcile before choosing "This device wins".

### Batch 6 (Phase 2) — leave dialog and tracker controls

- **Keep leave-dialog setup UI-driven**: disconnect-with-wipe imports a real fixture so the "Also wipe my library on this device" option appears naturally for a downloaded book.
- **Tracker visibility tests can stay mostly UI-level**: the auto-resume spec enables tracker settings through Settings → Statistics, uses the real reader tracker buttons, and only patches `document.visibilityState` to simulate tab hide/show events.

### Batch 7 (Phase 2) — source-only placeholder

- **Create source-only placeholders through a fresh-device flow**: the placeholder spec imports and syncs a real fixture, signs out and wipes local app state, then reconnects to the same OPFS-backed source. This covers "folder already has books" behavior without hand-planting `bookdata_*` or `progress_*` files.

### Batch 8 (Phase 2) — reading goals without books

- **Keep reading-goal setup UI-driven**: the reading-goals spec uses Settings → Statistics to create the goal, then connects an empty FS source. It asserts both the root-level sync artifact and the user-facing recovery path: wipe local app state, reconnect to the same source, and see the reading goal restored in Settings → Statistics.
- **Promote repeated settings workflows, not one-off shortcuts**: `enableStatistics()` moved to `tests/integration/helpers/harness.ts` only after three specs shared the same Settings → Statistics toggle flow. The helper still drives the real UI and waits for an enabled-only section, avoiding direct settings/localStorage writes while removing repeated hydration-prone click code.
- **Keep sync helper APIs directional**: source connection and local mirroring are different operations. `syncAfterSourceConnected()` should handle source-level import/reconcile follow-up; `mirrorLocalLibraryToSource()` should handle pushing local/imported state outward. Avoid boolean options that make one helper mean both directions at once.
- **Prefer user-facing recovery assertions when storage checks find a gap**: a source artifact assertion can prove a sync write happened, but a fresh-device/wipe-and-reconnect assertion proves the app can actually consume that artifact. Add the UI-level recovery check when the scenario is about portability or restore behavior.
