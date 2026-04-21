# Storage & Sync System — Survey

A survey of the app's current storage and sync functionality, written ahead of a UI and
possibly functional refactor. This document is descriptive: it explains what exists in
the code today, not what it should look like afterwards. Evidence is given as
`file:line` references so claims can be checked and debated.

All paths are relative to the repo root.

---

## 1. Terminology as it exists in the code

The codebase does not have a single unified term for "a configured place the user can
store data." Several overlapping concepts appear, and they are worth distinguishing
precisely before any refactor.

- **`StorageKey`** — an enum of storage _types_. The five values are `browser`, `fs`,
  `gdrive`, `onedrive`, `backup` (`src/lib/data/storage/storage-types.ts:1-7`).
- **`StorageSource` / `BooksDbStorageSource`** — a _named, configured instance_ of a
  storage type, persisted in IndexedDB. E.g. a specific OneDrive account the user has
  authorised, with its tokens. Schema in
  `src/lib/data/database/books-db/versions/v6/books-db-v6.ts:54-61`.
- **Storage handler** — the runtime object that knows how to talk to a given source.
  Abstract base is `BaseStorageHandler` in
  `src/lib/data/storage/handler/base-handler.ts`; concrete classes live alongside it
  (one per backend plus `backup`).
- **Sync target** — a single named source designated as the auto-sync destination. A
  property of the user's app, not of any specific source.
- **Per-type default source** — for each of gdrive / onedrive / fs, the named source
  that represents "the active one" when the UI references that type.
- **`StorageDataType`** — an enum of the _kinds of data_ that can flow between sources:
  `data` (books), `bookmark` (progress), `statistic`, `readingGoal`
  (`src/lib/data/storage/storage-types.ts:9-14`).

Suggested vocabulary for the refactor discussion (not in the code today):

- **Backend / storage type** for `StorageKey` values.
- **Source** for a named, configured instance (`BooksDbStorageSource`).
- **Sync target** keeps its name.

The UI today uses phrases like "data source for this type" and "sync target", neither of
which is defined anywhere user-facing.

---

## 2. Storage types (backends)

### 2.1 `StorageKey` enum

```ts
// src/lib/data/storage/storage-types.ts
export enum StorageKey {
  BACKUP = 'backup',
  BROWSER = 'browser',
  FS = 'fs',
  GDRIVE = 'gdrive',
  ONEDRIVE = 'onedrive'
}
```

### 2.2 Backends in detail

| Type       | Handler                                                                       | API                                                                         | Auth                                                                             |
| ---------- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `browser`  | `BrowserStorageHandler` (`src/lib/data/storage/handler/browser-handler.ts`)   | IndexedDB (`books-db` v6)                                                   | none                                                                             |
| `fs`       | `FilesystemStorageHandler` (`filesystem-handler.ts`)                          | File System Access API (`showDirectoryPicker`, `FileSystemDirectoryHandle`) | per-page-load permission grant                                                   |
| `gdrive`   | `GDriveStorageHandler` (`gdrive-handler.ts`), extends `ApiStorageHandler`     | REST                                                                        | OAuth 2.0 (`clientId`, `clientSecret`, `refreshToken` stored as `RemoteContext`) |
| `onedrive` | `OneDriveStorageHandler` (`onedrive-handler.ts`), extends `ApiStorageHandler` | REST                                                                        | OAuth 2.0, same shape                                                            |
| `backup`   | `BackupStorageHandler` (`backup-handler.ts`)                                  | in-memory ZIP                                                               | n/a                                                                              |

### 2.3 Pre-configured default sources

Two named sources exist baked into the code and are registered automatically:

```ts
// src/lib/data/storage/storage-types.ts
export enum StorageSourceDefault {
  GDRIVE_DEFAULT = 'miwake-gdrive-default',
  ONEDRIVE_DEFAULT = 'miwake-onedrive-default'
}

export const defaultStorageSources = [
  { name: StorageSourceDefault.GDRIVE_DEFAULT, type: StorageKey.GDRIVE },
  { name: StorageSourceDefault.ONEDRIVE_DEFAULT, type: StorageKey.ONEDRIVE }
];
```

These are the developer's (miwake's) own pre-registered OAuth client credentials, letting
users log in to Google Drive / OneDrive without having to create their own OAuth apps.
The `/settings/data` UI hides the Edit button for them
(`src/lib/components/settings/settings-storage-source-list.svelte` around line 280 — the
owner block flags them as app-defaults).

### 2.4 Internal (UI-only) sentinels

```ts
export enum InternalStorageSources {
  INTERNAL_DEFAULT = 'miwake-internal-source',
  INTERNAL_BROWSER = 'miwake-internal-browser',
  INTERNAL_ZIP = 'miwake-internal-zip'
}
```

These are _not_ configurable sources. They are strings used inside the settings-sync
dialog (`src/lib/components/settings/settings-sync-dialog.svelte`) to represent "the
browser" and "a ZIP file" in source/target pickers. `INTERNAL_DEFAULT` marks any source
that the user cannot edit (the two app-defaults above).

### 2.5 `BooksDbStorageSource` record shape

```ts
// src/lib/data/database/books-db/versions/v6/books-db-v6.ts:54-61
interface BooksDbV6StorageSource {
  name: string;
  type: StorageKey;
  data: FsHandle | ArrayBuffer | RemoteContext;
  storedInManager: boolean;
  encryptionDisabled: boolean;
  lastSourceModified: number;
}
```

The `data` field is a union with three shapes, selected by type:

- `FsHandle = { directoryHandle: FileSystemDirectoryHandle, fsPath: string }` for `fs`.
- `RemoteContext = { clientId, clientSecret, refreshToken }` for `gdrive`/`onedrive`.
- `ArrayBuffer` for any of the above when encrypted with a user password (see §8).

`storedInManager: true` together with an `ArrayBuffer` means the password is obtained
from the browser credential manager (`navigator.credentials.get`) on unlock rather than
prompting the user each time.

---

## 3. The two toggles on `/settings/data`

The screen that causes most of the user-facing confusion. Both toggles live on
`src/lib/components/settings/settings-storage-source-list.svelte`. Each configured source
row has four buttons: Edit, Sync Target, Data Source (per-type default), and Delete.

### 3.1 "Sync target" toggle (cloud-up icon)

```svelte
onclick={() => syncTarget$.next($syncTarget$ === storageSource.name ? '' : storageSource.name)}
```

(around line 297).

- Writes the name of the source into the `syncTarget$` store.
- Exclusive across the whole app — only one source can be the sync target.
- Re-clicking the same source clears it (sets empty string).
- Persisted to `localStorage` under the key `syncTarget` (`src/lib/data/store.ts:233`).

What it actually controls: the reader (`src/routes/b/+page.svelte`) uses this to decide
where to push reading progress / statistics / reading goals, and which source to pull
those same kinds of data from when a book is opened. See §5.

### 3.2 "Data source for this type" toggle (table-list icon)

```svelte
setStorageSourceDefault( storageSourceIsSourceDefault ? '' : storageSource.name, storageSource.type
)
```

(around line 308).

- Sets `gDriveStorageSource$`, `oneDriveStorageSource$`, or `fsStorageSource$` depending
  on the source's type (`src/lib/data/storage/storage-source-manager.ts:66-84`).
- Exclusive _per type_ — only one gdrive, one onedrive, one fs source can be the default
  for its type at once.
- Persisted to `localStorage` under the keys `gDriveStorageSource`, `oneDriveStorageSource`,
  `fsStorageSource` (`src/lib/data/store.ts:221-233`).

What it actually controls:

- Which source the `/manage` view shows when you pick a type from its dropdown.
- Which source handler is instantiated when the reader needs to read/write a book whose
  `storageSource` is blank but whose type is external (`src/routes/b/+page.svelte:935`,
  `:957`).
- If the current fs default is cleared and the active `storageSource$` was pointing to
  fs, the app falls back to `StorageKey.BROWSER` (`storage-source-manager.ts:66`).

### 3.3 Interaction between the two

Both toggles can be set independently. Common, intended configurations:

- **Nothing set**: all data stays in the browser, nothing syncs anywhere.
- **Per-type default set, sync target not set**: the user can manually browse / sync
  books to/from an external source via `/manage`, but no auto-sync happens.
- **Sync target set to the same source as its per-type default**: auto-sync is active
  and the sync target matches what the `/manage` view shows.
- **Sync target on one source, per-type default on a different source of the same type**:
  legal but confusing. Auto-sync goes to the sync target, but `/manage` shows the other
  one.

The UI does not explain any of this. The two buttons look similar, the tooltip
`"Toggle source as data source for this type"` is opaque, and there is no visual cue
distinguishing "auto-syncs here" from "shown on /manage."

### 3.4 Other controls on `/settings/data`

Beyond the two toggles, the page exposes (`src/routes/settings/data/+page.svelte`):

- `autoReplication$` direction picker: `Off` / `Up` / `Down` / `All`.
- `replicationSaveBehavior$`: `NewOnly` / `Overwrite`.
- `statisticsMergeMode$`: `merge` / `replace` / `local`.
- `readingGoalsMergeMode$`: same enum.
- `cacheStorageData$`: boolean.
- `requestPersistentStorage$`: boolean.
- `showExternalPlaceholder$`: boolean (controls whether placeholder books — see §9 —
  appear in the browser view on `/manage`).
- Add-source dialogs for each external type.

---

## 4. The `/manage` screen

File: `src/routes/manage/+page.svelte`.

### 4.1 The source chooser

`storageSource$` (`src/lib/data/store.ts` around line 23 of that module) is a plain
`StorageKey` — it is a _view selector_, not a sync setting. Changing it swaps which
storage's contents are listed.

Different sources genuinely can hold different sets of books. Books imported from an
external source may exist as **placeholders** in the browser view (§9). Bookmarks and
statistics can also diverge between sources until sync runs.

### 4.2 The Sync / Export dialog

Rendered by `src/lib/components/book-export/export-data-type-checkboxes.svelte`:

```svelte
<label><input type="checkbox" value="data" /> Books</label>
<label><input type="checkbox" value="bookmark" /> Bookmarks</label>
<label><input type="checkbox" value="statistic" /> Statistics</label>
```

**Reading goals are deliberately not offered here.** Anyone who wants to sync reading
goals has to go to `/settings/statistics` (§6).

Flow: the user selects books in the list, opens the dialog, picks target and data types,
and `replicateData()` is invoked with the configured source handler as source and the
target handler as destination.

Export to ZIP uses the same pipeline with `StorageKey.BACKUP` as the target (§10).

---

## 5. Auto-sync in the reader

File: `src/routes/b/+page.svelte`.

### 5.1 Direction control

```ts
// src/lib/functions/replication/replication-options.ts
enum AutoReplicationType {
  Off = 'off',
  Up = 'up',
  Down = 'down',
  All = 'all'
}
```

`autoReplication$` in `src/lib/data/store.ts:205` is persisted to `localStorage` key
`autoReplication`. Default `Off`.

### 5.2 Choosing the external handler

When a book is opened (roughly `src/routes/b/+page.svelte:278-282`):

```ts
if (bookData.storageSource) {
  externalStorageHandler = await getStorageHandlerByName(bookData.storageSource);
} else if ($autoReplication$ !== AutoReplicationType.Off) {
  externalStorageHandler = await getStorageHandlerByName($syncTarget$);
}
```

So a book imported from an external source keeps syncing back to _that_ source, even if
it isn't the current sync target. Only browser-origin books fall back to
`$syncTarget$`.

### 5.3 Down-sync (pull from external on book open)

In `syncDownData()` (called around line 287, logic around lines 1071-1079), if
`autoReplication$` is `Down` or `All`, the reader pulls `PROGRESS`, `STATISTICS`,
and `READING_GOALS` from the external handler before rendering. Reading goals are
_only_ auto-pulled here; they are never auto-pushed.

### 5.4 Up-sync triggers

Up-sync is queued via a `scheduleReplication(dataType)` helper that appends to a
`dataToReplicate` array, and drained by a debounced RxJS observable (`replicator$`,
around line 470-474, with roughly a 60 s debounce). Triggers observed:

| Line  | Trigger                                             | Data type queued        |
| ----- | --------------------------------------------------- | ----------------------- |
| ~810  | completion tracker update                           | `STATISTICS`            |
| ~823  | `saveBookmark()`                                    | `PROGRESS`              |
| ~862  | scroll-derived progress (debounced 250 ms upstream) | `PROGRESS`              |
| ~1019 | `saveExternalLastRead()`                            | (metadata / `PROGRESS`) |
| ~1163 | custom reading-point set                            | `PROGRESS`              |
| ~1366 | completion-tracking updates                         | `STATISTICS`            |
| ~1646 | stats-changed event                                 | `STATISTICS`            |

Execution happens in `executeReplication()` around line 1214, which calls
`replicateData(localStorageHandler, externalStorageHandler, …, dataToReplicate)` and
clears the queue.

Up-sync is guarded by `upSyncEnabled` (line ~574), which is
`externalStorageHandler exists && autoReplication$ ∈ {Up, All}`.

### 5.5 What is _not_ auto-synced

- **Books themselves**: there is no background push of newly imported books to the sync
  target. Book content only crosses sources via the explicit `/manage` sync dialog, or
  by being imported from an external source in the first place.
- **Reading goals up-sync**: only pulled on open, never pushed from the reader.
- **App settings**: not synced anywhere (§7).

---

## 6. `/settings/statistics` and reading-goals sync

File: `src/lib/components/settings/settings-reading-goals.svelte`.

`syncReadingGoals()` (around line 208) opens `SettingsSyncDialog`
(`src/lib/components/settings/settings-sync-dialog.svelte`), which offers a source _and_
a target picker. The pickers list:

- `INTERNAL_BROWSER` (browser IndexedDB),
- `INTERNAL_ZIP` (import or export via a ZIP file),
- every configured external source (gdrive, onedrive, fs) from the DB.

Confirming the dialog invokes:

```ts
replicateData(sourceHandler, targetHandler, false, [], [StorageDataType.READING_GOALS]);
```

(around line 253), scoped to reading goals only and using `readingGoalsMergeMode$` via
the handlers.

**The library sync dialog in `/manage` does NOT include reading goals.** This is the
piece the user's previous recollection got wrong. Reading goals only move:

- Auto-_down_ on book open, when `autoReplication$` is `Down`/`All` (§5.3), _and_
- Manually, via this reading-goals-only dialog in `/settings/statistics`.

There is no way to auto-push reading goal edits made on `/settings/statistics`.

---

## 7. Data-kind × storage matrix

| Data kind                                                        | Canonical location          | Manual sync UI                            | Auto-sync                                               |
| ---------------------------------------------------------------- | --------------------------- | ----------------------------------------- | ------------------------------------------------------- |
| Book content (`DATA`)                                            | IndexedDB (browser-handler) | `/manage` → Sync dialog                   | No                                                      |
| Bookmarks / progress (`PROGRESS`)                                | IndexedDB                   | `/manage` → Sync dialog                   | Up on bookmark / scroll / completion; Down on book open |
| Statistics (`STATISTIC`)                                         | IndexedDB                   | `/manage` → Sync dialog                   | Up on tracker updates / completion; Down on book open   |
| Reading goals (`READING_GOALS`)                                  | IndexedDB                   | `/settings/statistics` → dedicated dialog | Down on book open only                                  |
| App settings (theme, fonts, keybindings, tracker settings, etc.) | `localStorage`              | None                                      | No                                                      |

Every `$` store in `src/lib/data/store.ts` that wraps `writable*LocalStorageSubject` is,
by definition, unsynced. The full list is long (60+ keys) — the categories are UI /
layout, typography / display, reading navigation, sync / storage settings themselves,
statistics tracking settings, import/export defaults, and various "last used" state.

One consequence worth flagging: the user's configured storage sources and sync settings
_are themselves_ in this unsynced layer. Wiping `localStorage` deletes them without
deleting the books or their credentials in IndexedDB.

---

## 8. Per-source password encryption

File: `src/lib/data/storage/storage-source-manager.ts`.

Every source record has two encryption-related fields:

- `encryptionDisabled: boolean` — if `true`, skip encryption entirely.
- `storedInManager: boolean` — if `true` _and_ `data` is an `ArrayBuffer`, fetch the
  password from the browser credential manager (`navigator.credentials.get({ password: true })`)
  rather than prompting the user.

The algorithm is PBKDF2 (16-byte salt) deriving an AES-256-GCM key (12-byte IV); the
stored payload is `salt || iv || ciphertext`. Both OAuth `RemoteContext` objects and
`FsHandle` objects can be encrypted; browser-stored `FileSystemDirectoryHandle` can be
persisted encrypted this way too.

`unlockStorageData()` (around line 116-177 of that file) drives the flow:

- If `data` is already a plain `RemoteContext` / `FsHandle`, return it directly.
- If it is an `ArrayBuffer` and `storedInManager`, try the credential manager.
- Otherwise show the `StorageUnlock` dialog and prompt the user.

User-facing: the add-source flows initially store credentials encrypted (default
`encryptionDisabled: false`). Whether the user sees a password prompt depends on
`storedInManager`.

---

## 9. Placeholder books

A book is a **placeholder** when `isPlaceholder: true` — set when `elementHtml` is empty:

- Generated by `BrowserStorageHandler` (`browser-handler.ts:49`, `:285`) for book records
  missing `elementHtml`.
- Generated by `BaseStorageHandler` (`base-handler.ts:501`) when creating a local stub
  for an external-source book.

Reading:

- `/manage` filters placeholders out of the browser view unless `$showExternalPlaceholder$`
  is `true` (`src/routes/manage/+page.svelte:71`).
- The book card dims them with `opacity-60`
  (`src/lib/components/book-card/book-card-list.svelte:41`).

Opening a placeholder throws (`browser-handler.ts:79-85`):

```
Placeholder books should be opened from their original source - last source: {storageSource}
```

If the originating source has since been deleted, the message still names the old source
name but the user has no way to reopen it without re-adding the source. There is no
warning on source deletion that placeholder books depend on it.

---

## 10. Backup / ZIP flow

`StorageKey.BACKUP` + `BackupStorageHandler` aren't an ongoing sync backend — they are a
one-shot ZIP bridge used by both export and import.

Export path from `/manage`:

1. User picks data types (again, books / bookmarks / statistics; no reading goals).
2. `runReplication(StorageKey.BACKUP, types)` fires
   (`src/routes/manage/+page.svelte:431`).
3. `replicateData(source, backupHandler, …)` accumulates entries in the backup handler.
4. `replicator.ts:344`: if the target is a `BackupStorageHandler`, call
   `createExportZip()` which builds the zip and triggers a download.

Import path uses `parseBackupZip` + `replicateData(backupHandler → targetHandler)`.

The settings-sync dialog (§6) offers `INTERNAL_ZIP` on both sides, so reading goals can
be exported to / imported from a ZIP independently.

---

## 11. Merge modes and save behaviors

### 11.1 Enums

```ts
// src/lib/data/merge-mode.ts
enum MergeMode {
  MERGE = 'merge',
  REPLACE = 'replace',
  LOCAL = 'local'
}

// src/lib/functions/replication/replication-options.ts
enum ReplicationSaveBehavior {
  Overwrite = 'overwrite',
  NewOnly = 'new'
}
enum AutoReplicationType {
  Off = 'off',
  Up = 'up',
  Down = 'down',
  All = 'all'
}
```

### 11.2 Store bindings

| Store                      | localStorage key          | Default   | Applies to              |
| -------------------------- | ------------------------- | --------- | ----------------------- |
| `replicationSaveBehavior$` | `replicationSaveBehavior` | `NewOnly` | all data types globally |
| `statisticsMergeMode$`     | `statisticsMergeMode`     | `MERGE`   | `STATISTICS`            |
| `readingGoalsMergeMode$`   | `readingGoalsMergeMode`   | `MERGE`   | `READING_GOALS`         |

Books and bookmarks use only `replicationSaveBehavior$` — there is no per-kind merge
mode for them.

### 11.3 Edge cases to be aware of

- Reading-goal deletions do not propagate unless either `readingGoalsMergeMode$` is
  `REPLACE` or `replicationSaveBehavior$` is `Overwrite`
  (`settings-reading-goals.svelte:293`). This is surfaced in a UI note but is unintuitive.
- `MergeMode.LOCAL` for statistics/goals means the target keeps its own copy and ignores
  the incoming data — useful for one-way "I don't want my phone to leak partial reads
  back to my desktop" setups, but the label "Local" is only really meaningful if the
  user knows which side of the sync they are.

---

## 12. `replicateData()` — the core sync primitive

File: `src/lib/functions/replication/replicator.ts:153-352`.

Signature:

```ts
export async function replicateData(
  sourceHandler: BaseStorageHandler,
  targetHandler: BaseStorageHandler,
  refreshDataList: boolean,
  contexts: ReplicationContext[],
  dataToReplicate: StorageDataType[],
  cancelSignal?: AbortSignal
);
```

Shape of what it does:

1. Split `dataToReplicate` into per-book kinds (`DATA`, `PROGRESS`, `STATISTICS`) and
   reading goals (global).
2. If `requestPersistentStorage$` is set, ask the browser for persistent storage.
3. Clear handler caches if `cacheStorageData$` is `false` on either side.
4. For each `ReplicationContext` (one per book), for each requested data type:
   - Compare "recent" metadata (filename timestamps on remote / modified times locally)
     to skip up-to-date entries.
   - If stale, call `sourceHandler.get<kind>()` and `targetHandler.save<kind>()`.
   - If `DATA` changed, also fetch and replicate the cover image.
5. If `READING_GOALS` is in `dataToReplicate`, do the same comparison/copy once (no
   per-book loop).
6. Finalize: if the target is a `BackupStorageHandler`, call its `createExportZip()` to
   produce the download.
7. Return an error string (`''` means success).

Concurrency is limited to 1 via `pLimit`, so operations are serialised. There is no
visible progress indicator beyond the numeric counter in the dialog that calls this
function.

---

## 13. Handler-specific details worth noting for refactor

### 13.1 Filesystem handler

- `FileSystemDirectoryHandle` is stored in IndexedDB as part of `FsHandle`. It survives
  page reloads as an object, but the _permission_ does not — `verifyPermission()` is
  called on every `ensureRoot()` (`filesystem-handler.ts:547-604`), and the handler
  surfaces a `StorageUnlock` dialog on "activation is required" errors.
- There is no graceful background re-auth path — the user must be interacting with the
  page.

### 13.2 OneDrive / GDrive handlers

- Both extend `ApiStorageHandler` and use a shared token-refresh flow via
  `StorageOAuthManager`.
- The OneDrive refresh-token flow now requests `offline_access` (recent commit
  `5ec9728`), which means existing users who authorised before that change may need to
  re-authorise to get usable refresh tokens.

### 13.3 Offline behaviour

- `isOnline$` (`src/lib/data/store.ts:498`) is a plain writable subject (not persisted).
- The reader checks it before starting gdrive/onedrive sync
  (`src/routes/b/+page.svelte:935-1003`) and shows a message dialog rather than a
  structured offline state.
- FS sources work offline but there is no UI signal that "sync still works for this
  source" while cloud sources are blocked.

### 13.4 Cache strategy

`cacheStorageData$` is consumed by each handler's list operations
(e.g. `gdrive-handler.ts:158`, `onedrive-handler.ts:239`, `filesystem-handler.ts:714`,
`:732`). When disabled, every list call refetches; when enabled, the cache persists
until `handler.clearData()` is called. Base-handler helper: `isCacheDisabled()` at
`base-handler.ts:179`.

---

## 14. All routes that touch storage UI

| Route                  | File                                          | What it does                                                                                                         |
| ---------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `/manage`              | `src/routes/manage/+page.svelte`              | Library / source view, import, export, manual sync                                                                   |
| `/b` (reader)          | `src/routes/b/+page.svelte`                   | Reader with transparent auto-sync (§5)                                                                               |
| `/settings/data`       | `src/routes/settings/data/+page.svelte`       | Source list, the two toggles (§3), auto-replication direction, save behavior, merge modes, cache, persistent-storage |
| `/settings/statistics` | `src/routes/settings/statistics/+page.svelte` | Statistics display + reading-goals sync dialog (§6)                                                                  |
| `/auth`                | `src/routes/auth/+page.svelte`                | OAuth callback handler                                                                                               |

---

## 15. Inconsistencies, surprises, and likely pain points

A non-exhaustive list of things noticed during the survey that are candidates for the
refactor discussion. None of these are asserted as bugs; they're places where the
current design is load-bearing in ways the user isn't told.

1. **Two toggles with near-identical affordances.** "Sync target" and "Data source for
   this type" on `/settings/data` are visually similar, do different things, and are
   never explained. Their interaction (sync-target ≠ per-type-default) is legal but
   confusing.
2. **Reading-goals coverage is half there.** Auto-pulled on book open, never auto-pushed
   from the reader, absent from `/manage` sync, and synced via a separate dialog in
   `/settings/statistics`.
3. **Books are never auto-synced.** Auto-sync covers only progress / statistics / goals.
   A user might reasonably assume turning on "Up" syncs new imports, but it does not.
4. **Placeholder books are brittle.** They silently depend on their original source name
   being present. Deleting a source doesn't warn about dependent placeholders; opening a
   placeholder from a deleted source throws.
5. **App settings don't sync.** Theme, fonts, tracker config, keybindings etc. live in
   `localStorage` only. So do the sync settings themselves — including the source-default
   and sync-target choices — which means wiping `localStorage` disconnects a device from
   its sources without actually removing anything in IndexedDB.
6. **`MergeMode.LOCAL` label is ambiguous.** It means "target keeps its own data" but the
   user has to know which side is the target.
7. **Reading-goal deletions silently don't propagate** unless merge mode is `REPLACE` or
   save behavior is `Overwrite`. Mentioned in a small UI note; easy to miss.
8. **No progress/visibility for auto-sync.** The reader queues work and drains it on a
   ~60 s debounce; there's no "syncing now" indicator or last-synced timestamp.
9. **Concurrent auto-sync safety.** Replication is serialised per-call (pLimit 1) but
   multiple scheduled replications can queue; error handling silently bumps a counter
   without surfacing anything.
10. **Offline signalling is inconsistent.** Cloud handlers show a dialog; FS is silent;
    the reader keeps running either way.
11. **FS re-permission friction.** Every session the user must re-grant directory access,
    and if they reload the page mid-session a sync may hit the permission dialog.
12. **`/manage` Sync button only appears after selecting books.** Cannot sync "everything
    except books" from that screen — you have to select at least one book.
13. **`lastSyncedSettingsSource$` / `lastSyncedSettingsTarget$`.** These look like the
    skeleton of a broader "settings sync" feature, but they are currently used only to
    remember picker defaults for the reading-goals dialog. Not orphaned in the strict
    sense, but the naming suggests ambitions the code never delivered.

---

## 16. Suggested refactor axes (for the follow-up discussion only)

These are _not_ proposals — just the dimensions along which the above complexity could
be reorganised. Each is a choice the user will need to make:

- **Collapse the two toggles.** Either make the per-type default a consequence of the
  sync target, or expose them as "used on /manage" and "used for auto-sync" with plain
  labels.
- **Decide whether books themselves should auto-sync.** Currently a hole; a refactor
  could close it or make it explicit.
- **Unify the reading-goals sync story.** Either include them in `/manage` sync, or
  auto-sync them like progress, or document clearly that `/settings/statistics` is the
  one place.
- **Surface sync state.** Last-sync timestamp per source, current-direction indicator,
  errors since last successful sync.
- **Treat placeholder books as a first-class concept** with warnings on source delete
  and a "rehydrate from source X" action.
- **Decide whether app settings should sync.** The skeleton is there; the implementation
  isn't.

End of survey.
