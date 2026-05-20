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
3. Find the most recent batch PR (if any) to see the current audit-worksheet style and pick up where it left off.
4. The original harness at `~/miwake-harness/` is the reference for what each scenario does. Don't modify it; treat it as read-only source material until all scenarios are migrated, then archive it.
5. The Bug 1 verification in Phase 0 matters: if it isn't actually fixed in main, scenario 4 conversion will fail until it is.
