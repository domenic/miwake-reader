# Storage & Sync Redesign

A proposed redesign of the app's storage and sync system, based on the survey in
[`storage-survey.md`](./storage-survey.md) and the design discussion that followed.
This document is prescriptive: it describes the target state, not the current one.

Scope: functionality and UI. It does not prescribe implementation details beyond what's
needed to pin down user-visible behavior. A subsequent doc (or just code review) will
cover the implementation plan.

A major next step is producing UI mockups. Section 4 is explicitly organized around the
screens/dialogs that need mocks, with enough detail that each can be handed off as a
self-contained mock prompt.

---

## 1. Goals

1. **Reduce the number of user-visible concepts.** Collapse "storage sources,"
   "sync target," "per-type defaults," and "direction" into: a cloud account, a local
   folder, and a single status indicator.
2. **Make sync ambient.** A typical user never opens the sync UI. They connect once,
   and the app keeps itself consistent in the background.
3. **Preserve power-user functionality** that existing users rely on (direction, merge
   modes, save behaviors, custom OAuth, ZIP backup/restore), but move it behind a clear
   Advanced boundary with proper explanatory prose.
4. **Stop surfacing implementation details.** No placeholder books as a user concept,
   no per-source library views, no `storageSource` pointer per book.
5. **Keep offline-first behavior.** Everything works without a network; sync is a
   background reconciliation, not a precondition for reading.

Non-goals for this iteration:

- Syncing app settings (theme, fonts, tracker config, keybindings). The plumbing opens
  the door for this, but the actual design — schema, conflict resolution, versioning —
  is deferred.
- Multiple cloud accounts simultaneously.
- Migration from the current data model. Clean break is acceptable (n = 1 user).

---

## 2. Conceptual model

### 2.1 The canonical store

Browser IndexedDB is the one source of truth on each device. Every read and every
write the reader performs goes through it. Neither cloud nor filesystem sync is on
the hot path of reading or writing a book.

### 2.2 The two sync backends (peers)

The user may configure zero, one, or both of:

- **Cloud sync** — exactly one of Google Drive or OneDrive. OAuth-based.
- **Filesystem sync** — exactly one local directory via the File System Access API.

Both are first-class peers in the UI. Neither is the "primary"; neither is a "mirror of
the other." Each syncs bidirectionally against the local IndexedDB:

```
     ┌──────────────┐       ┌──────────────┐
     │ Cloud (GDrive│       │ Local folder │
     │  or OneDrive)│       │  (FS API)    │
     └──────┬───────┘       └──────┬───────┘
            │                      │
            └───────┐    ┌─────────┘
                    ▼    ▼
              ┌──────────────┐
              │  IndexedDB   │  ← canonical, read/write hot path
              │   (books,    │
              │  bookmarks,  │
              │   stats,     │
              │   goals)     │
              └──────────────┘
```

Consequences:

- Cloud and FS do not sync with each other directly. They both converge via IndexedDB.
- If a user has both connected and makes an edit on device A, it propagates through
  IndexedDB → cloud → IndexedDB on device B → filesystem on device B. That's fine; it's
  not real-time, but it's eventually consistent.
- Conflict resolution happens only between a backend and IndexedDB, never
  backend-to-backend. Simpler.

### 2.3 The three kinds of data

| Kind                                                          | Stored in IndexedDB  | Synced to backends         | Notes                                                                |
| ------------------------------------------------------------- | -------------------- | -------------------------- | -------------------------------------------------------------------- |
| Books (content + cover)                                       | Yes                  | Yes                        | Large payloads, synced on first save and when explicitly re-imported |
| Reading data (bookmarks, progress, statistics, reading goals) | Yes                  | Yes                        | Small payloads, synced on every change (debounced)                   |
| App settings                                                  | Yes (`localStorage`) | **No, for this redesign.** | Deferred to a future iteration                                       |

No per-data-kind user controls. The user never chooses "sync books but not statistics."
The Advanced panel has merge-mode knobs that affect how syncs reconcile each kind, but
not whether they sync.

### 2.4 Book states

Each book has exactly one of three on-device states, communicated by a small icon:

- **Downloaded.** Full content in IndexedDB. Opens instantly.
- **Cloud-only.** Metadata (title, cover, progress, statistics) in IndexedDB, but no
  content. Clicking it fetches the content from the configured cloud account, then
  opens. After that, it is Downloaded — forever, no eviction policy in this iteration.
  Reading goals are app-global and not tied to individual books, so they aren't part of
  this state machine.
- **Transient (syncing / failed).** Indicated via the sync status indicator, not via a
  per-book icon.

There is no placeholder concept exposed to the user. `/manage` is one library view; the
per-source dropdown is removed. A book is always either in your library (downloaded or
cloud-only) or it isn't.

The per-book `storageSource` pointer in `BooksDbStorageSource` is also removed — since
there's at most one cloud account, "where the book came from" is unambiguous.

### 2.5 Sync triggers

- **On any change in IndexedDB** (new book, bookmark save, stat update, goal change):
  a debounced sync to each connected backend.
- **On app open / coming back online**: a reconciliation pull from each connected
  backend.
- **On explicit user action** ("Force full re-sync" button): full reconciliation in
  both directions for both backends.

No timer-based polling. No user-facing direction toggle by default (direction knob
exists but is under Advanced and defaults to "Both").

### 2.6 Permission / reauth flow

Both cloud and filesystem sync can need the user to reauthorize:

- **Cloud**: OAuth refresh token expired or revoked → pop up the OAuth reauth window.
- **FS**: File System Access API permission is missing. The `FileSystemDirectoryHandle`
  itself persists in IndexedDB across page reloads, so the folder is remembered; but
  the _permission_ to read/write it may have to be re-granted depending on browser
  state (e.g. if the user hasn't interacted with that origin recently, or moved
  between sessions). When a sync needs access and the browser reports permission as
  anything other than `granted`, pop up the permission dialog.

In both cases, the prompt is **lazy**: it only appears when a sync action actually
needs the resource. Never on page load. Never as a passive banner. If the user never
does anything that triggers a sync, the app stays quiet. When a prompt is needed but
not yet shown, the sync status indicator surfaces "Needs attention" and clicking it
triggers the prompt.

---

## 3. Features — kept, cut, gated

### 3.1 Kept as first-class

- Cloud sync with GDrive or OneDrive (pre-configured OAuth apps).
- Filesystem sync with a user-picked directory.
- A sync status indicator in the reader and library.
- ZIP backup export.
- ZIP backup import.
- Offline-first behavior for everything.

### 3.2 Kept under Advanced

Each needs real prose explaining what it does, not just a label. Copy sketches in §5.

- **Sync direction** (`AutoReplicationType`): Off / Up only / Down only / Both.
  Default: Both. Applies uniformly to both backends.
- **Statistics merge** (`MergeMode`): Merge / Replace / Keep local. Default: Merge.
- **Reading goals merge** (`MergeMode`): Merge / Replace / Keep local. Default: Merge.
- **Cache remote file lists** (`cacheStorageData`): on/off, default off.
- **Custom OAuth client** per provider: clientId / clientSecret / token endpoint.
  Replaces the app-default credentials when set. Note: the UI entry point for this is
  _not_ inside Advanced — see §4.1. It's gated here only to flag it as an advanced
  workflow.

### 3.3 Cut entirely

- **Placeholder books as a user concept.** Implementation may still have records
  without `elementHtml`, but the user never sees the word "placeholder" and cannot
  toggle their visibility.
- `showExternalPlaceholder$` setting.
- Per-source view in `/manage`. The source-type dropdown is gone.
- The "sync target" concept as a separate idea from "the cloud account."
- The "per-type default source" concept. One cloud account, one FS folder; no
  disambiguation needed.
- Multiple configured sources per type. Exactly one GDrive OR one OneDrive. Exactly
  one FS folder.
- Password encryption of OAuth tokens in IndexedDB.
- `storedInManager` / `encryptionDisabled` fields on storage source records.
- Per-book `storageSource` pointer.
- The manual library sync dialog in `/manage`.
- The reading-goals sync dialog in `/settings/statistics`.
- The `SettingsSyncDialog` component entirely.
- `INTERNAL_BROWSER` / `INTERNAL_ZIP` / `INTERNAL_DEFAULT` sentinels.
- `lastSyncedSettingsSource$` / `lastSyncedSettingsTarget$` stores.
- The `/manage` "Sync" button (per-selection). Replaced by ambient sync; explicit sync
  needs are covered by "Force full re-sync" in Settings → Sync.
- Selective-book ZIP backup (current model: pick books, then export). Replaced by the
  unified backup dialog described in §4.5.

### 3.4 Deferred to a later iteration

- App settings sync.
- Multi-cloud-account support.
- Book eviction (to free IndexedDB space once libraries grow large).

---

## 4. UI surfaces to mock

This is the section most relevant to the next task: producing mocks in claude.ai. Each
subsection below is scoped so it can be handed off as an independent mock prompt. For
each, I give: the screen's purpose, every state it must depict, the user actions it
must expose, and copy suggestions where the wording matters.

### 4.1 Settings → Sync (primary sync settings screen)

**Purpose.** The one place a user goes to configure sync. Replaces the current
`/settings/data`.

**Layout.** Two peer sections (Cloud, Filesystem) stacked, each self-contained, then a
collapsed Advanced section, then a Data Management section.

**States to depict per section:**

Cloud sync:

1. Not connected. Primary: two connect buttons (Google Drive, OneDrive). Secondary
   (inline, not hidden under Advanced): a "Use custom OAuth credentials" link or
   disclosure per provider, which opens the custom-credentials editor (§4.9). The
   flow must support a first-time user who wants to use their own OAuth app from the
   start without ever attempting auth against the miwake-default app.
2. Connected to Google Drive. Shows account email, last-synced timestamp, number of
   books in sync, whether miwake-default or custom credentials are in use. "Sign out"
   button. A secondary affordance to swap between default and custom credentials
   without signing out first.
3. Connected to OneDrive. Same shape.
4. Connected, reauth needed. Shows "Reconnect required" with a Reconnect button and
   an explanation.
5. Connected, sync error. Shows the last error (short description + expandable
   details) with a Retry button. No Ignore button — errors clear on successful retry
   or on the next successful sync; until then they persist in the status indicator.

**Custom-credentials retention.** Once the user enters custom OAuth credentials for a
provider, they're kept in IndexedDB even if the user switches back to
miwake-default. Switching back to custom doesn't require re-entering them. An
explicit "Clear custom credentials" action in the custom-credentials editor (§4.9)
wipes them.

Filesystem sync:

1. Not configured. "Choose folder…" button.
2. Configured. Shows the folder path, last-synced timestamp. "Change folder" and
   "Disconnect" buttons.
3. Configured, permission lapsed. "Reconnect required" with a button.
4. Configured, sync error. As cloud.

Advanced (collapsed by default):

- Direction radio (Off / Up only / Down only / Both).
- Statistics merge radio (Merge / Replace / Keep local).
- Reading goals merge radio (Merge / Replace / Keep local).
- Cache remote file lists checkbox.

Note: there is no user-facing "Conflict behavior" knob anymore. Ambient sync
always uses Keep-newest (per-item timestamp comparison). When a user explicitly
invokes Force re-sync, that dialog offers a direction / which-side-wins choice
locally — see §4.7.

(Custom OAuth credentials are _not_ in Advanced — they live in the main Cloud sync
section per the Not-connected state above.)

Data management (at the bottom, not under Advanced since non-power-users need it):

- [Export backup to ZIP] → opens §4.5.
- [Import backup from ZIP] → opens §4.6.
- [Force full re-sync] → opens §4.7 confirmation.
- [Sign out & wipe local data] → opens §4.8 confirmation.

**Copy priorities.** Labels for Advanced knobs need full sentences, not just enum
values. Draft copy in §5.

### 4.2 Sync status indicator (component, used everywhere)

**Purpose.** A single reusable component that shows sync state. Always rendered in the
lower-left corner of the viewport, across all screens (reader, library, settings).
Same position and shape everywhere — the reader already has an indicator there; this
generalizes it app-wide with clearer icons.

**States to depict:**

1. **Idle, in sync.** Neutral icon (e.g. a small cloud or checkmark). On hover:
   "Synced 2 minutes ago."
2. **Syncing.** Animated spinner. On hover: "Syncing…"
3. **Offline.** Muted/grey icon with strikethrough. On hover: "Offline — changes will
   sync when you're back online."
4. **Needs attention (reauth / permission).** Amber icon with an exclamation. On
   hover: "Reconnect your cloud account to resume syncing." Clicking opens Settings →
   Sync and triggers the relevant prompt.
5. **Error.** Red icon. On hover: short error summary. Clicking opens Settings → Sync.
6. **Disabled (no backends configured).** Muted "Sync not configured" label/icon.
   Clicking opens Settings → Sync.

Single orientation (fixed to the lower-left corner). No per-chrome variations.

### 4.3 `/manage` library view (updated)

**Purpose.** The user's single, unified library view. No more source-type dropdown.

**Top bar:**

- Library title.
- Import-book button (file picker / drag-drop).
- Overflow menu: select mode, sort, filter.

(The sync status indicator is _not_ in the top bar — it lives in the lower-left corner
globally, per §4.2.)

**Book grid/list:**

- Each book card shows cover, title, and a state marker:
  - Downloaded: no marker.
  - Cloud-only: small cloud icon in a corner.
  - Syncing: overlay spinner on the card (not the per-app indicator).
  - Failed sync: small amber marker on the card.
- Clicking a downloaded book: opens the reader.
- Clicking a cloud-only book: starts download, shows progress on the card, opens the
  reader when complete.
- Clicking a syncing-errored book: error tooltip with Retry.

**Empty states:**

1. No books yet, no sync configured: a banner prompts "Connect cloud sync to load your
   library, or drop EPUB files here." Two buttons: Connect cloud / Import files.
2. No books yet, sync configured but empty: "Your library is empty. Import EPUB files
   to get started."

**Selection mode:**

- Entered via overflow menu or long-press (mobile).
- Actions in selection mode: Delete (from library, and from sync'd backends). That's
  it — no more per-selection sync, no more per-selection export.

### 4.4 First-run empty-library banner

**Purpose.** Onboard a fresh user into setting up sync (or not).

**Content:**

> **Sync your library across devices.**
> Connect Google Drive or OneDrive to keep your books, reading progress, and
> statistics in sync. Or skip this and store everything locally.
>
> [Connect Google Drive] [Connect OneDrive] [Not now]

Dismissing with "Not now" hides the banner for this user; it remains accessible from
Settings → Sync. Non-modal — the library screen below it is interactive.

### 4.5 Backup export dialog

**Purpose.** Generate a ZIP containing a user-chosen subset of their data for offline
backup, migration to another app, or sharing.

**Layout — a checkbox tree:**

```
Export backup
  [ ] App settings
  [ ] Reading goals
  [ ] Books (0 of 47 selected)
       [ ] Select all
       ┌─────────────────────────────────────────────────┐
       │ [ ] 吾輩は猫である                               │
       │      [✓] Book  [ ] Bookmarks  [ ] Statistics    │
       │                                                  │
       │ [ ] Norwegian Wood                               │
       │      [✓] Book  [ ] Bookmarks  [ ] Statistics    │
       │ …                                                 │
       └─────────────────────────────────────────────────┘

  [Cancel]  [Export]
```

**Rules:**

- If a book row is checked, "Book" is forced on (you can't export bookmarks without
  the book itself).
- Bookmarks and Statistics are independent toggles per book.
- "Select all" at the top applies to all books with default (Book only) settings.
- Settings and Reading goals are top-level, not per-book.
- The Export button is disabled until at least one thing is selected.

**On export:** close the dialog, show a progress toast, trigger the ZIP download when
done.

### 4.6 Backup import dialog

**Purpose.** Restore from a ZIP backup.

**Flow:**

1. User picks a ZIP file.
2. Dialog shows the same checkbox tree as export, pre-populated with what the ZIP
   contains. Items not in the ZIP are greyed out.
3. User chooses what to import.
4. Import runs using the user's existing Advanced settings (merge modes) — no extra
   prompts inline in the dialog. A small note at the bottom: "Items will be merged
   with your current library per your current sync settings (Advanced)."

**Mock states:**

1. File-picker step.
2. Selection step with a full-featured ZIP (all categories present).
3. Selection step with a partial ZIP (e.g. only reading goals).
4. In-progress import with progress feedback.
5. Completion summary ("Imported 12 books, 47 bookmarks, 3 reading goals").
6. Error state (ZIP unreadable / schema mismatch).

### 4.7 Force full re-sync confirmation

**Purpose.** Escape hatch when the user suspects something's out of sync, and the
one place where a non-default direction / overwrite intent can be expressed
(since ambient sync is fixed at Keep-newest).

**Layout.** Two choices plus a conversational explanation.

1. **Direction** (radio): which way this re-sync flows.
   - _Keep newest (default)_ — per-item timestamp comparison, just like ambient
     sync.
   - _This device wins_ — push local over every sync location, regardless of
     timestamps. Useful if you know local is the canonical copy.
   - _Sync location wins_ — pull each sync location over local, regardless of
     timestamps. Useful if local got corrupted or you want a clean re-download.
2. **Confirmation button** is labelled per choice: "Reconcile", "Push over",
   "Pull over".

**Copy:**

> **Force full re-sync?**
> Walks every book, bookmark, reading statistic, and reading goal in your
> library to check for differences between {describeSyncLocations(…)} and this
> device.
>
> - _Keep newest_: for each item, whichever side was modified most recently
>   wins. Safe default.
> - _This device wins_: push this device's version of every item to
>   {describeSyncLocations(…)}, ignoring modification times. Edits there not
>   yet synced here will be lost.
> - _Sync location wins_: pull every item from {describeSyncLocations(…)},
>   ignoring modification times. Any unsynced local edits will be lost.
>
> Reading statistics and reading goals also respect the merge-mode settings
> in Advanced, which govern how entries combine at the destination on top of
> the direction above.

After confirming: close the dialog, show the Syncing state in the status
indicator, report completion via a toast.

### 4.8 Sign out & wipe local data confirmation

**Purpose.** The "reset everything on this device" action.

**Copy:**

> **Sign out and wipe local data?**
> This will disconnect Google Drive and remove all books, bookmarks, statistics,
> reading goals, and app settings from this device. Your cloud data will not be
> changed — you can sign back in on any device to restore everything.
>
> [Cancel] [Sign out and wipe]

Mock should include a variant for when only filesystem sync is configured, and a
variant for when nothing is configured (the button should be labelled differently or
hidden).

### 4.9 Custom OAuth credentials editor

**Purpose.** Let users supply their own OAuth app credentials, replacing the
app-default `miwake-*-default` credentials. Opened via the "Use custom OAuth
credentials" link in the main Cloud sync section (§4.1), _not_ from Advanced. Must
support the first-time-user flow: a user who wants to skip miwake-default entirely
and connect with their own OAuth app.

**Fields:**

- Client ID (required).
- Client secret (required for GDrive, optional-or-required for OneDrive — confirm
  during implementation).
- Token endpoint (OneDrive only; GDrive uses a fixed Google endpoint).
- A note explaining what this is and when to use it.

**Copy:**

> **Custom OAuth credentials**
> By default, Miwake Reader uses its own OAuth client to connect to
> {Google Drive | OneDrive}. If you'd prefer to use your own OAuth application
> (for example, if your organization restricts third-party apps), enter its
> credentials here.
>
> Creating your own OAuth application is an advanced workflow. Most users should
> leave this blank.

**States:**

- Empty (using app defaults).
- Populated but not active (custom credentials stored, app is currently using
  miwake-default). Shows masked values, a "Use these credentials" action that swaps
  the active mode, a "Change" action, and a "Clear custom credentials" action.
- Populated and active (signed in with custom credentials). Shows masked values,
  "Change" and "Revert to miwake-default" (signs out, switches mode, keeps the
  stored custom credentials for later reuse).
- Validation error (bad client ID / secret format).

### 4.10 Reauth / permission prompts (inline)

**Purpose.** Lazy prompts that fire when a sync action needs credentials it doesn't
have.

**Two variants:**

1. **OAuth reauth.** Modal popup explaining the cloud account needs to be reconnected,
   with a single "Reconnect" button that launches the OAuth flow in a popup window.
2. **FS permission.** Modal popup explaining the local folder permission has lapsed,
   with a "Grant permission" button that invokes the File System Access API prompt.

Both should have a "Later" or dismiss option that cancels the in-flight sync but keeps
the backend configured. After dismissal, the sync status indicator shows "Needs
attention" until the user reconnects.

### 4.11 Sign-in flow (cloud connection)

**Purpose.** The initial OAuth flow when connecting Google Drive or OneDrive.

This mostly reuses browser OAuth UI (a popup window), but the pre- and post-flow
screens in our app need mocks:

1. Pre-flow: clicking "Connect Google Drive" shows a brief dialog: "You'll be
   redirected to Google to authorize Miwake Reader. After signing in, your library
   will sync automatically." [Continue] [Cancel]
2. Post-flow success: brief toast "Connected to Google Drive. Syncing now…" with the
   sync status indicator kicking into Syncing.
3. Post-flow failure: dialog with the error and a Retry button.

---

## 5. Advanced settings — explanatory copy

Each Advanced knob needs a short paragraph, not just a label. Below are draft copy
blocks; the mocks should display them (possibly collapsed behind an info icon, but
available).

### 5.1 Sync direction

> **Sync direction**
>
> - **Both (default).** Changes on this device are pushed to your backends, and
>   changes from other devices are pulled down.
> - **Up only.** Push changes from this device, but don't pull changes from others.
>   Useful if this device is the canonical source and you don't want to accidentally
>   pull in older data.
> - **Down only.** Pull changes from other devices, but don't push. Useful for
>   read-only devices (a phone you only read on).
> - **Off.** Nothing is synced. Your library stays local until you turn this back on.

### 5.2 Conflict handling (no knob)

Ambient sync always uses per-item timestamp comparison: the more recently
modified side wins. This used to be exposed as "Conflict behavior" with a
Keep-newest / Always-overwrite choice; it was removed because "Always overwrite"
combined with bidirectional sync produces an incoherent "last sync wins"
race-condition semantic (see the implementation plan for details).

The Force re-sync dialog (§4.7) is where any non-default direction / overwrite
intent lives now, scoped to one explicit invocation.

### 5.3 Statistics merge

> **How to combine reading statistics**
>
> - **Merge (default).** Days that only exist on one side are kept. When the same
>   day has statistics on both sides, the more recently updated entry wins.
> - **Replace.** When sync copies statistics for a book, the receiving side's
>   entire set for that book is replaced with the source side's set. Days that
>   only existed on the receiving side are lost.
> - **Keep local.** Leave this device's statistics unchanged during sync, even if
>   the data at the sync location is newer. Outgoing sync still pushes this
>   device's statistics out, replacing whatever is there.

### 5.4 Reading goals merge

> **How to combine reading goals**
>
> - **Merge (default).** Goals from both sides are combined. When the same goal
>   exists on both sides, the more recently updated version wins.
> - **Replace.** When sync copies goals, the receiving side's entire set of goals
>   is replaced with the source side's set, including deletions.
> - **Keep local.** Leave this device's goals unchanged during sync, even if the
>   data at the sync location is newer. Outgoing sync still pushes this device's
>   goals out, replacing whatever is there.

### 5.5 Cache remote file lists

> **Cache remote file lists in memory**
> When on, the app remembers the list of files in your cloud account or local folder
> during a session, so it doesn't have to refetch it for every sync. Off by default
> because the trade-off favors freshness over traffic for most users.

---

## 6. Data model changes

Summary of the changes required to the IndexedDB schema (v7). The mocks don't depend
on this, but it's listed here so a later implementation plan can reference it.

- `BooksDbStorageSource` simplified:
  - Remove `storedInManager`, `encryptionDisabled`.
  - `data` union reduced to `FsHandle | RemoteContext` (no `ArrayBuffer`).
  - At most one record per type across the table.
- Book record:
  - Remove `storageSource` field.
  - Remove `isPlaceholder` as a persisted flag if it exists as one; compute from
    `elementHtml === ''`.
- Settings / stores:
  - Remove `syncTarget`, `gDriveStorageSource`, `oneDriveStorageSource`,
    `fsStorageSource` (the separate per-type defaults).
  - Remove `lastSyncedSettingsSource`, `lastSyncedSettingsTarget`.
  - Remove `showExternalPlaceholder`.
  - Keep `autoReplication`, `replicationSaveBehavior`, `statisticsMergeMode`,
    `readingGoalsMergeMode`, `cacheStorageData`.

Clean break: no migration. Existing IndexedDB data is abandoned on upgrade; the user
reconnects their cloud account and downloads everything fresh.

---

## 7. Implementation notes (not exhaustive)

- The existing `BaseStorageHandler` and concrete handlers (`GDriveStorageHandler`,
  `OneDriveStorageHandler`, `FilesystemStorageHandler`, `BackupStorageHandler`) stay
  largely intact. The change is how many of them exist concurrently and how they're
  wired.
- `replicateData()` stays as the underlying primitive. It just gets called from fewer
  places (the sync engine, the backup export/import flows, the force-resync button).
- The sync status indicator should be a new component at
  `src/lib/components/sync-status/`, rendered once globally in the lower-left corner.
  Extract state/logic from the current reader footer rather than duplicating.
- Lazy prompt flow: when a sync operation fails with a known reauth/permission error,
  queue the operation, surface the prompt, and on successful reauth replay the
  queued operations.
- **RxJS removal.** The project has a separate, ongoing goal of replacing RxJS with
  native Svelte 5 reactivity (`$state` / `$derived` / `$effect`). The current sync
  code is heavily RxJS-based (observables in `src/lib/data/store.ts`, the
  `replicator$` stream in the reader, etc.). Since this redesign rewrites the sync
  code path anyway, the rewrite should move it off RxJS in the same pass rather than
  preserving RxJS and retrofitting later. The technical design phase should call out
  specific patterns to replace (debounced write queues, online/offline subjects,
  auto-sync scheduler).

---

## 8. Mock deliverables checklist

For handoff to claude.ai. Each bullet is one artifact to produce; each corresponds to
a subsection of §4.

- [ ] Settings → Sync page, all states (§4.1). Single artifact with multiple frames.
- [ ] Sync status indicator component, all six states, both orientations (§4.2).
- [ ] `/manage` library view with new book-state markers and empty states (§4.3).
- [ ] First-run empty-library banner (§4.4).
- [ ] Backup export dialog (§4.5).
- [ ] Backup import dialog, all six states (§4.6).
- [ ] Force full re-sync confirmation (§4.7).
- [ ] Sign out & wipe confirmation, with variants (§4.8).
- [ ] Custom OAuth client dialog (§4.9).
- [ ] Reauth / permission prompts, both variants (§4.10).
- [ ] Sign-in flow screens (§4.11).

Suggested order for mocking (most design impact first):

1. Settings → Sync (§4.1) — the most information-dense, sets the visual language for
   everything else.
2. `/manage` library view (§4.3) — affects the daily UX the most.
3. Sync status indicator (§4.2) — depends on visual decisions from §4.1 but reused
   everywhere.
4. Backup export dialog (§4.5) — novel interaction pattern (the checkbox tree) worth
   iterating on.
5. Everything else — mostly follows the patterns established above.

End of redesign.
