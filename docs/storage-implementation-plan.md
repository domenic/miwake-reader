# Storage & Sync Implementation Plan

Implementation roadmap for the redesign described in
[`storage-redesign.md`](./storage-redesign.md). Working branch: `sync-redesign`.
The user is the only current user, so breaking changes to IndexedDB and
localStorage are acceptable — no migration is needed.

## Sequencing strategy

UI-first. The mockup at `/tmp/settings_sync_redesign.html` is specific; the sync
engine rewrite is much more open-ended. Building UI first lets the user see and
react to progress; the plumbing underneath can be rewritten afterwards against a
stable UI contract.

The work is split into **six phases**. Phases 1–3 are independent enough to be
done in any order; phase 4 depends on them; phase 5 is the cleanup pass; phase 6
is finishing touches.

---

## Phase 1 — New Settings → Sync page (UI, with new stores)

**Goal.** Build `/settings/sync` with all 7 mockup frames. Bind to _new_
simplified stores so the UI is the driver for the data model, not the other way
around.

Steps:

1. Add `/settings/sync` to `settings-route.ts`, and add a nav entry in
   `settings-header.svelte` (icon: `faCloudArrowUp` or similar).
2. Introduce new stores in `src/lib/data/sync-store.ts`:
   - `activeCloudProvider$`: `'gdrive' | 'onedrive' | null`
   - `cloudCustomCredentials$`: `{ gdrive: Creds | null; onedrive: Creds | null }`
   - `fsConfigured$`: boolean
   - Re-export the surviving advanced knobs: `autoReplication$`,
     `statisticsMergeMode$`, `readingGoalsMergeMode$`, `cacheStorageData$`.
     (`replicationSaveBehavior$` / "Conflict behavior" is not exposed as an
     ambient-sync knob — see Phase 4.)
3. Build the page itself in `src/routes/settings/sync/+page.svelte` with four
   sections (Cloud sync, Filesystem sync, Advanced, Data management). Each
   section is its own component under
   `src/lib/components/settings/sync/`:
   - `sync-cloud-section.svelte`
   - `sync-filesystem-section.svelte`
   - `sync-advanced-section.svelte`
   - `sync-data-management-section.svelte`
4. Build the custom-OAuth dialog as a `showDialog()`-compatible component:
   `src/lib/components/settings/sync/custom-oauth-dialog.svelte`.
5. Wire up the actions (Connect, Sign out, Switch to X, Reconnect, Grant access,
   Retry, Choose folder, Change folder, Disconnect, Use/Manage custom
   credentials). For this phase, actions call stub functions on the new stores —
   the actual OAuth/FS plumbing is phase 4.

**Deliverable.** A fully interactive `/settings/sync` page that visually matches
the mockup frames and can fake every state via store manipulation. Doesn't yet
perform any real sync.

---

## Phase 2 — Data model simplification (schema v7)

**Goal.** IndexedDB schema v7 with the new `BooksDbStorageSource` shape, and the
removal of per-book `storageSource` pointer + `isPlaceholder` field.

Steps:

1. Add `src/lib/data/database/books-db/versions/v7/` with:
   - `books-db-v7.ts` — new types.
   - `upgrade-books-db.ts` — **wipe** old sync sources table and old per-book
     fields (clean break; no migration).
2. New `BooksDbStorageSource` record:
   ```ts
   interface BooksDbV7StorageSource {
     name: 'cloud' | 'fs';
     providerType: StorageKey.GDRIVE | StorageKey.ONEDRIVE | StorageKey.FS;
     data: FsHandle | RemoteContext;
     lastSyncedAt: number;
   }
   ```
   At most one record with `name === 'cloud'`, at most one with `name === 'fs'`.
3. Remove from book records: `storageSource`, `isPlaceholder`. Derive
   placeholder state at read time from `elementHtml === ''`.
4. Bump `currentDbVersion` to 7.

**Deliverable.** The app opens, creates/upgrades to v7, and loads without
errors. No sync works yet.

---

## Phase 3 — Storage source manager rewrite

**Goal.** Replace `src/lib/data/storage/storage-source-manager.ts` (later
renamed to `storage-source-types.ts`) with a thin, non-RxJS module that
manages exactly one cloud source and one FS source.

Steps:

1. New module `src/lib/data/sync/source-manager.ts` exposing:
   - `getCloudSource(): Promise<BooksDbV7StorageSource | null>`
   - `setCloudSource(type, data): Promise<void>`
   - `clearCloudSource(): Promise<void>`
   - `getFsSource(): Promise<BooksDbV7StorageSource | null>`
   - `setFsSource(handle): Promise<void>`
   - `clearFsSource(): Promise<void>`
2. Remove password encryption code (`encrypt`, `decrypt`, `unlockStorageData`).
   OAuth tokens and FS handles go into IndexedDB as plain objects.
3. Custom OAuth credentials stored separately in `localStorage` under
   `cloudCustomCredentials` (keyed by provider). Retained across provider
   switches per the design doc.
4. Remove the 5 stores: `gDriveStorageSource$`, `oneDriveStorageSource$`,
   `fsStorageSource$`, `syncTarget$`, `lastSyncedSettingsSource$`,
   `lastSyncedSettingsTarget$`. Update all callers.

**Deliverable.** Cloud sign-in and FS folder selection work end-to-end through
the new Settings → Sync page. Data persists across reloads. Sync itself is
still stubbed.

---

## Phase 4 — Ambient sync engine (no RxJS)

**Goal.** Replace the reader's `replicator$` / `executeReplicate$` pipeline with
an ambient, Svelte-native sync engine driven by database change events. Lazy
reauth/permission prompts.

Steps:

1. New module `src/lib/data/sync/sync-engine.ts`. Core shape:
   ```ts
   type SyncState =
     | { kind: 'idle' }
     | { kind: 'syncing' }
     | { kind: 'offline' }
     | { kind: 'needs-attention'; reason: 'oauth' | 'fs-permission'; backend: 'cloud' | 'fs' }
     | { kind: 'error'; message: string; backend: 'cloud' | 'fs'; detail?: string };
   export const syncState = $state<SyncState>({ kind: 'idle' });
   ```
2. `syncEngine.start()` subscribes to database change events (the existing
   `storageSourcesChanged$` / `dataListChanged$` / `bookmarksChanged$` subjects
   from `database.service.ts` — these we keep as RxJS internally for now) and
   schedules syncs with a native debouncer.
3. `syncEngine.forceFullResync()` for the manual button.
4. `syncEngine.triggerSync(dataType)` replaces `scheduleReplication(dataType)`
   in the reader. Internally uses a plain `setTimeout`-based debouncer, not
   RxJS.
5. Lazy reauth: when `replicateData()` rejects with a recognizable OAuth-401 or
   FS-`NotAllowedError`, set `syncState` to `needs-attention` and queue the
   operation. When the user explicitly reconnects (via the status indicator or
   the sync settings page), replay the queue.
6. Delete the RxJS observables `replicator$`, `executeReplicate$`,
   `replicationProgress$`.
7. **Hardcode "Keep newest" for ambient sync.** The old
   `ReplicationSaveBehavior` / "Conflict behavior" knob was removed from the
   Advanced UI because `Always overwrite` + `Both` direction had incoherent
   semantics — each ambient sync is unidirectional, so "whichever side is
   copied from wins, ignore timestamps" produced a "last sync wins" race. New
   engine: ambient sync always uses per-item timestamp comparison
   (`ReplicationSaveBehavior.NewOnly` behavior internally). The "overwrite
   anyway" escape hatch moves to the explicit Force re-sync dialog, where the
   user picks a direction and opts in per-invocation.
8. **Consider dropping `MergeMode.LOCAL` entirely.** It was never surfaced in
   the old UI, is not surfaced in the new UI, and its existing implementation
   is inconsistent (identical to `REPLACE` for reading goals; a per-`dateKey`
   clobber with no "wipe" for statistics). In the engine rewrite, options are:
   either strip it from the enum and all code paths, or leave the enum value
   but make it a documented no-op. Favor the former unless there's
   stored-state to preserve.

**Deliverable.** Sync works ambiently. Auto-sync up/down on bookmark save,
stat update, book open, app open. No timer-based polling in the reader.

---

## Phase 5 — Sync status indicator + `/manage` cleanup

**Goal.** The global status indicator; the simplified library view.

Steps:

1. `src/lib/components/sync-status/sync-status-indicator.svelte`. Props: none
   (reads `syncState` directly). Rendered in `src/routes/+layout.svelte` so it
   appears on every route. Absolute-positioned bottom-left.
2. Six visual states per §4.2 of redesign doc. Click behavior:
   - `needs-attention`: triggers the relevant reauth prompt directly.
   - `error`: opens `/settings/sync`.
   - `idle`/`syncing`/`offline`: no action (or a small tooltip-only).
   - `disabled`: opens `/settings/sync`.
3. Update `src/routes/manage/+page.svelte`:
   - Remove the storage-source dropdown and `storageSource$` binding entirely.
   - Show books from the unified IndexedDB view only.
   - Add a cloud-icon overlay on cards whose `elementHtml === ''`.
   - Clicking a cloud-only book: trigger download, show per-card spinner,
     navigate to reader when done.
   - Remove the per-selection Sync and Export buttons. Selection now only has
     Delete.
4. Remove old sync code paths:
   - `SettingsSyncDialog` component and its callers.
   - The library `sync-dialog-content.svelte` and its export equivalent.
   - `settings-reading-goals.svelte` sync button (keep the goals config, drop
     the sync dialog).

**Deliverable.** Library view is one list. Global indicator is live.

---

## Phase 6 — Backup dialogs + final cleanup

**Goal.** New backup export/import dialogs; final pass removing cut features.

Steps:

1. New `src/lib/components/backup/backup-export-dialog.svelte` with the
   checkbox tree described in §4.5 of the redesign doc. Triggered from
   `sync-data-management-section.svelte`.
2. New `src/lib/components/backup/backup-import-dialog.svelte` with the file
   picker → tree flow from §4.6.
3. Delete:
   - `src/lib/data/storage/storage-types.ts` — remove
     `InternalStorageSources`, `internalStorageSourceName`,
     `defaultStorageSources`, `StorageSourceDefault`. Keep `StorageKey`,
     `StorageDataType`.
   - `src/routes/settings/data/+page.svelte` and the whole `settings/data/`
     route folder (replaced by `/settings/sync`).
   - `src/lib/components/settings/settings-storage-source-list.svelte` and
     `settings-storage-source.svelte`.
   - `src/lib/components/settings/settings-sync-dialog.svelte`.
4. Drop password-encryption functions and imports of `navigator.credentials`
   for OAuth.
5. Drop `showExternalPlaceholder$` and any references.
6. Update `settings-route.ts` to remove `/settings/data` from the type union.

**Deliverable.** Clean codebase, redesigned sync, no dead code.

---

## Out of scope

Deferred to later iterations per the redesign doc:

- App settings sync (theme, fonts, keybindings, tracker config).
- Book eviction from IndexedDB.
- Migration of existing user data (n = 1).

## RxJS removal

The redesign doc flags this as an ongoing side goal. This plan removes RxJS
from the sync path specifically. The remaining RxJS usage — `database.service.ts`
subjects (`dataListChanged$`, `bookmarksChanged$`, etc.), the reader's book-load
pipeline, `writableStorageSubject` helpers — is **not** in scope here. A later
pass can migrate those; the sync rewrite should not expand its scope to do
them.

One nuance: new sync code must not create new RxJS dependencies. If it needs
reactive state, it uses `$state` / `$derived` / `$effect`. If it needs
database change events, it subscribes to the existing RxJS subjects _from_
non-RxJS code (single `.subscribe()` call at startup).
