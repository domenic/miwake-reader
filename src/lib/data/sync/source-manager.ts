import { gDriveClientId, oneDriveClientId, pagePath } from '$lib/data/env';
import type { BooksDbStorageSource } from '$lib/data/database/books-db/versions/books-db';
import { getSyncEndpoint } from '$lib/data/storage/storage-handler-factory';
import type { FsHandle, RemoteContext } from '$lib/data/storage/storage-source-manager';
import { clearOAuthTokenCache, StorageOAuthManager } from '$lib/data/storage/storage-oauth-manager';
import { SyncEndpointType } from '$lib/data/storage/storage-types';
import { database } from '$lib/data/store';
import {
  cloudCustomCredentials$,
  lastCloudHint$,
  syncHealth$,
  syncLocation$,
  type CloudProviderType,
  type CustomOAuthCredentials,
  type SyncLocation
} from '$lib/data/sync/sync-store';
import {
  ensurePlaceholders,
  pruneUnreachablePlaceholders,
  pushAllLocalBooks
} from '$lib/data/sync/sync-engine';
import {
  cloudSourceName,
  FS_SOURCE_NAME,
  isCustomCloudName,
  readSubject as read
} from '$lib/data/sync/sync-helpers';

export interface LeaveOptions {
  /**
   * Wipe the user's downloaded books, bookmarks, statistics, and
   * goals from this device after disconnecting. Does NOT clear app
   * settings, themes, or custom OAuth credentials — those survive
   * (use the heavier "Sign out and wipe local data" action for a
   * full reset). Defaults to false; the caller's confirm dialog is
   * where this gets opted into.
   */
  clearLibrary?: boolean;
}

/**
 * Replace whatever sync location is currently set with a new one.
 * If a different location is already configured, this acquires the
 * new destination first (popup / picker, both of which require a
 * user-activation), then tears the prior one down only after auth /
 * pickup succeeds. Failing late means a canceled or popup-blocked
 * switch leaves the prior connection intact.
 *
 * Caller is responsible for confirming the destructive switch with
 * the user; this function just executes.
 */
export async function switchToCloud(
  provider: CloudProviderType,
  opts: LeaveOptions = {}
): Promise<void> {
  const current = read<SyncLocation | null>(syncLocation$);
  const customCreds =
    read<Partial<Record<CloudProviderType, CustomOAuthCredentials>>>(cloudCustomCredentials$)[
      provider
    ];
  const useCustom = !!customCreds;
  const isSameSource =
    current?.kind === 'cloud' &&
    current.provider === provider &&
    current.usesCustomCredentials === useCustom;

  // Open the auth popup synchronously while we're still inside the
  // click's user activation. Awaiting anything (disconnect, count
  // queries, IDB transactions) before window.open risks the popup
  // blocker firing.
  const authWindow = StorageOAuthManager.createWindow(
    `${pagePath}/auth?miwake-init-wait=1`,
    'auth',
    Math.min(Math.max(window.innerWidth, 300), 560),
    Math.min(Math.max(window.innerHeight, 300), 560),
    window
  );
  if (!authWindow) {
    throw new Error('Unable to open the sign-in window. Check your popup blocker settings.');
  }

  await connectCloud(provider, {
    authWindow,
    priorLocation: isSameSource ? null : current,
    clearLibrary: opts.clearLibrary
  });
}

export async function switchToFs(opts: LeaveOptions = {}): Promise<void> {
  const current = read<SyncLocation | null>(syncLocation$);

  // showDirectoryPicker dispatches synchronously and consumes the
  // user activation; the await is just for the user's pick. Have to
  // call it before any other awaits.
  const directoryHandle = await window.showDirectoryPicker({
    id: 'miwake-reader-root',
    mode: 'readwrite'
  });

  // Same-kind switch (FS → FS, just a different folder) writes to the
  // single FS_SOURCE_NAME record and replaces in place — no separate
  // teardown step.
  const isSameSource = current?.kind === 'fs';

  await connectFs({
    directoryHandle,
    priorLocation: isSameSource ? null : current,
    clearLibrary: opts.clearLibrary
  });
}

interface ConnectOptions {
  /**
   * If set, the prior sync location whose record + OAuth cache (cloud
   * only) should be torn down after the new connection succeeds. Used
   * by switchToCloud / switchToFs so the destructive part can't run
   * before the new destination is locked in.
   */
  priorLocation?: SyncLocation | null;
  /**
   * If true, wipe the local library between auth/pickup and the new
   * source's pushAllLocalBooks step. The user's intent with this is
   * "don't pollute the new sync with my old device's content," so it
   * has to happen before push.
   */
  clearLibrary?: boolean;
}

/**
 * Connect a local folder by showing the native directory picker,
 * persisting the handle, and seeding placeholders for whatever's
 * already inside. Caller handles AbortError (picker cancel).
 *
 * `directoryHandle` lets switchToFs call showDirectoryPicker under
 * the click's user activation and then pass the handle in here, so
 * the rest of the flow can take its time without losing the gesture.
 */
export async function connectFs(
  opts: { directoryHandle?: FileSystemDirectoryHandle } & ConnectOptions = {}
): Promise<void> {
  const directoryHandle =
    opts.directoryHandle ??
    (await window.showDirectoryPicker({
      id: 'miwake-reader-root',
      mode: 'readwrite'
    }));
  const fsPath = directoryHandle.name;

  const data: FsHandle = { directoryHandle, fsPath };
  const record: BooksDbStorageSource = {
    name: FS_SOURCE_NAME,
    type: SyncEndpointType.FS,
    data,
    lastSourceModified: Date.now()
  };

  const existing = await (await database.db).get('storageSource', FS_SOURCE_NAME);
  await database.saveStorageSource(record, existing ? FS_SOURCE_NAME : '');

  // Tear down the prior connection (cloud record / FS record under a
  // different key — only matters when prior was cloud, since FS uses
  // the same record name). Library wipe happens here too, before the
  // upcoming push, so the new sync doesn't end up mirroring the old
  // device's content.
  if (opts.priorLocation || opts.clearLibrary) {
    await teardownPriorLocation(opts.priorLocation ?? null, !!opts.clearLibrary);
  }

  await reconcileFromSource(SyncEndpointType.FS, FS_SOURCE_NAME);

  const now = Date.now();
  syncLocation$.next({
    kind: 'fs',
    path: fsPath,
    connectedAt: now,
    // The booklist + placeholder seed counts as a successful sync.
    lastSyncedAt: now
  });
  syncHealth$.next({ status: 'ok' });

  // Mirror existing local content into the new folder. Ambient sync
  // only fires on local edits; without this, a fresh connect with an
  // empty folder would stay empty until the user happened to bookmark
  // something.
  await pushAllLocalBooks();
}

/**
 * Connect a cloud provider. Opens the OAuth popup _synchronously_ under
 * the caller's user-activation window (must be called directly from a
 * click handler, no prior awaits) unless the caller already opened one
 * and passed it in. Writes the storage-source record, drives OAuth
 * through that popup, then fetches the initial book count. Rolls back
 * on OAuth failure.
 *
 * `authWindow` lets switchToCloud open the popup itself (so it gets
 * to consume the click's user activation before any awaits) and pass
 * it in here. `priorLocation` opts into teardown of an old source
 * after auth succeeds — never before, since a popup-blocked or
 * user-canceled switch should leave the prior connection intact.
 */
export async function connectCloud(
  provider: CloudProviderType,
  opts: { authWindow?: Window } & ConnectOptions = {}
): Promise<void> {
  const authWindow =
    opts.authWindow ??
    StorageOAuthManager.createWindow(
      `${pagePath}/auth?miwake-init-wait=1`,
      'auth',
      Math.min(Math.max(window.innerWidth, 300), 560),
      Math.min(Math.max(window.innerHeight, 300), 560),
      window
    );
  if (!authWindow) {
    throw new Error('Unable to open the sign-in window. Check your popup blocker settings.');
  }

  try {
    const customCreds =
      read<Partial<Record<CloudProviderType, CustomOAuthCredentials>>>(cloudCustomCredentials$)[
        provider
      ];
    const useCustom = !!customCreds;
    const name = cloudSourceName(provider, useCustom);

    const remoteData: RemoteContext = useCustom
      ? {
          clientId: customCreds.clientId,
          clientSecret: customCreds.clientSecret,
          refreshToken: '',
          tokenEndpoint: customCreds.tokenEndpoint
        }
      : {
          clientId: provider === SyncEndpointType.GDRIVE ? gDriveClientId : oneDriveClientId,
          clientSecret: '',
          refreshToken: ''
        };

    const record: BooksDbStorageSource = {
      name,
      type: provider,
      data: remoteData,
      lastSourceModified: Date.now()
    };

    const existing = await (await database.db).get('storageSource', name);
    await database.saveStorageSource(record, existing ? name : '');

    // Clear any in-memory access token so authenticate() doesn't
    // short-circuit on a still-valid cached access token while the
    // persisted refreshToken we just wrote is empty — the user would
    // appear connected for the rest of the session and then have no
    // way to refresh on the next boot.
    clearOAuthTokenCache(name);

    const handler =
      provider === SyncEndpointType.GDRIVE
        ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, name)
        : getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, name);

    try {
      await handler.authenticate(authWindow);
    } catch (err) {
      // OAuth failed — restore prior state. If a record existed
      // before, put it back: we just clobbered its refreshToken with
      // an empty string, so a naive delete-on-failure would leave the
      // user permanently signed out instead of merely failing this
      // attempt. If there was no prior record, drop the placeholder
      // we wrote.
      if (existing) {
        await database.saveStorageSource(existing, name);
      } else {
        const db = await database.db;
        const stored = await db.get('storageSource', name);
        if (stored) await database.deleteStorageSource(stored);
      }
      throw err;
    }

    // Tear down the prior connection now that auth has succeeded —
    // never before, since a popup-blocked or canceled flow would leave
    // the user with no working sync.
    if (opts.priorLocation || opts.clearLibrary) {
      await teardownPriorLocation(opts.priorLocation ?? null, !!opts.clearLibrary);
    }

    // Token is cached now; this call won't re-open the popup.
    const books = await reconcileFromSource(provider, name);

    const now = Date.now();
    syncLocation$.next({
      kind: 'cloud',
      provider,
      usesCustomCredentials: useCustom,
      connectedAt: now,
      lastSyncedAt: now,
      bookCount: books.length
    });
    syncHealth$.next({ status: 'ok' });
    lastCloudHint$.next({ provider, usesCustomCredentials: useCustom });

    await pushAllLocalBooks();
  } finally {
    if (!authWindow.closed) {
      authWindow.close();
    }
  }
}

/**
 * After connecting (or switching to) a sync location, list its titles
 * and reconcile placeholders both ways: ensure rows exist for every
 * remote title, prune rows for titles that don't (e.g., placeholders
 * left over from a prior cloud the user just switched away from).
 * Returns the remote book list so cloud connects can stamp bookCount
 * onto syncLocation$.
 */
async function reconcileFromSource(
  type: SyncEndpointType.GDRIVE | SyncEndpointType.ONEDRIVE | SyncEndpointType.FS,
  storageSourceName: string
) {
  const handler =
    type === SyncEndpointType.GDRIVE
      ? getSyncEndpoint(window, SyncEndpointType.GDRIVE, storageSourceName)
      : type === SyncEndpointType.ONEDRIVE
        ? getSyncEndpoint(window, SyncEndpointType.ONEDRIVE, storageSourceName)
        : getSyncEndpoint(window, SyncEndpointType.FS, storageSourceName);

  // Handlers are module-level singletons that cache title listings (and
  // for FS, the root directory handle) keyed by storageSourceName. On
  // a fresh connect or a folder swap, those caches are stale even
  // though the name didn't change. Reset before listing.
  handler.clearData();

  const books = await handler.listSyncTitles();
  const ensured = await ensurePlaceholders(books);
  const reachable = new Set(books.map((b) => b.title));
  const pruned = await pruneUnreachablePlaceholders(reachable);
  if (ensured > 0 || pruned > 0) {
    database.notifyDataListChanged();
  }
  return books;
}

/**
 * Tear down a prior sync location's persistent state — the
 * storageSource record, OAuth in-memory cache (cloud only), and
 * (optionally) the local library. Used by switchToCloud / switchToFs
 * after the new destination has been successfully acquired, so a
 * canceled or popup-blocked switch doesn't strand the user.
 */
async function teardownPriorLocation(
  prev: SyncLocation | null,
  clearLibrary: boolean
): Promise<void> {
  if (prev) {
    const db = await database.db;
    if (prev.kind === 'cloud') {
      const name = cloudSourceName(prev.provider, prev.usesCustomCredentials);
      clearOAuthTokenCache(name);
      const existing = await db.get('storageSource', name);
      if (existing) {
        await database.deleteStorageSource(existing);
      }
    } else {
      // FS → cloud teardown: drop the FS record. (FS → FS replaces
      // the same record in place via connectFs; this branch only
      // runs when the prior was a different kind.)
      const existing = await db.get('storageSource', FS_SOURCE_NAME);
      if (existing) {
        await database.deleteStorageSource(existing);
      }
    }
  }

  if (clearLibrary) {
    await wipeLibraryContents();
  }
}

/**
 * Tear down whatever sync location is currently configured. Idempotent
 * if nothing is connected. Drops in-memory OAuth tokens (for cloud) so
 * a same-tab reconnect re-runs the popup, deletes the IDB storageSource
 * record, prunes placeholders that are no longer reachable, and clears
 * the connection + health subjects.
 *
 * If `opts.clearLibrary` is true, also wipes the user's books,
 * bookmarks, statistics, and reading goals from this device — see
 * LeaveOptions.
 */
export async function disconnect(opts: LeaveOptions = {}): Promise<void> {
  const current = read<SyncLocation | null>(syncLocation$);
  if (!current) {
    syncLocation$.next(null);
    syncHealth$.next({ status: 'ok' });
    if (opts.clearLibrary) {
      await wipeLibraryContents();
    }
    return;
  }

  const db = await database.db;

  if (current.kind === 'cloud') {
    const name = cloudSourceName(current.provider, current.usesCustomCredentials);
    // Drop the in-memory access token so a same-tab reconnect actually
    // re-runs the OAuth popup; otherwise the manager would reuse the
    // still-valid cached token and never persist a new refresh_token.
    clearOAuthTokenCache(name);
    const existing = await db.get('storageSource', name);
    if (existing) {
      await database.deleteStorageSource(existing);
    }
  } else {
    const existing = await db.get('storageSource', FS_SOURCE_NAME);
    if (existing) {
      await database.deleteStorageSource(existing);
    }
  }

  syncLocation$.next(null);
  syncHealth$.next({ status: 'ok' });

  if (opts.clearLibrary) {
    await wipeLibraryContents();
    return;
  }

  // No remaining source after disconnect (single-location model), so
  // every placeholder is unreachable. The empty reachable set drops
  // them all in one pass.
  const pruned = await pruneUnreachablePlaceholders(new Set<string>());
  if (pruned > 0) {
    database.notifyDataListChanged();
  }
}

/**
 * Wipe just the library — books, bookmarks, statistics, reading
 * goals, last-item bookmark, plus the localStorage reading-goal hint
 * (since that pairs with the readingGoal IDB store). App settings,
 * themes, custom OAuth credentials, and reader prefs survive — use
 * the heavier "Sign out and wipe local data" action for a full reset.
 */
async function wipeLibraryContents(): Promise<void> {
  const db = await database.db;
  const tx = db.transaction(
    ['data', 'bookmark', 'statistic', 'lastModified', 'readingGoal', 'lastItem'],
    'readwrite'
  );
  await Promise.all([
    tx.objectStore('data').clear(),
    tx.objectStore('bookmark').clear(),
    tx.objectStore('statistic').clear(),
    tx.objectStore('lastModified').clear(),
    tx.objectStore('readingGoal').clear(),
    tx.objectStore('lastItem').clear()
  ]);
  await tx.done;

  localStorage.removeItem('readingGoal');
  localStorage.removeItem('lastReadingGoalsModified');

  database.notifyDataListChanged();
}

/**
 * On app boot, reconcile the syncLocation$ runtime subject with
 * what's actually persisted in IndexedDB. Call once from the root
 * layout on mount.
 */
export async function loadConnectionsFromDb(): Promise<void> {
  const db = await database.db;
  const records = await db.getAll('storageSource');

  // Cloud takes precedence: if both somehow exist (carried over from
  // pre-pivot installs), the cloud record wins and the FS record is
  // dropped. Disconnect/reconnect cycles maintain the at-most-one
  // invariant going forward.
  const cloudRecord = records.find(
    (r) => r.type === SyncEndpointType.GDRIVE || r.type === SyncEndpointType.ONEDRIVE
  );
  const fsRecord = records.find((r) => r.type === SyncEndpointType.FS && r.name === FS_SOURCE_NAME);

  if (cloudRecord) {
    syncLocation$.next({
      kind: 'cloud',
      provider: cloudRecord.type as CloudProviderType,
      usesCustomCredentials: isCustomCloudName(cloudRecord.name),
      connectedAt: cloudRecord.lastSourceModified,
      lastSyncedAt: null,
      bookCount: null
    });
    if (fsRecord) {
      // Stale FS record from a pre-pivot install — drop it.
      await db.delete('storageSource', FS_SOURCE_NAME);
    }
  } else if (
    fsRecord &&
    fsRecord.data &&
    typeof fsRecord.data === 'object' &&
    'fsPath' in fsRecord.data
  ) {
    const fsData = fsRecord.data as FsHandle;
    syncLocation$.next({
      kind: 'fs',
      path: fsData.fsPath,
      connectedAt: fsRecord.lastSourceModified,
      lastSyncedAt: null
    });
  } else {
    // No IDB record. If we have a cross-device cloud hint from
    // app-settings backup, surface a reconnect prompt.
    const hint = read<{ provider: CloudProviderType; usesCustomCredentials: boolean } | null>(
      lastCloudHint$
    );
    if (hint) {
      syncHealth$.next({
        status: 'reauth-required',
        summary: `Reconnect ${hint.provider === SyncEndpointType.GDRIVE ? 'Google Drive' : 'OneDrive'}`,
        detail:
          'This device is missing the sign-in for the cloud account in your last backup. Reconnect to resume syncing.'
      });
    }
  }
}
