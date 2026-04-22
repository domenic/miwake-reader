import type { GDriveStorageHandler } from '$lib/data/storage/handler/gdrive-handler';
import type { OneDriveStorageHandler } from '$lib/data/storage/handler/onedrive-handler';
import { NeedsInteractiveAuthError } from '$lib/data/storage/storage-oauth-manager';
import { StorageKey, StorageSourceDefault } from '$lib/data/storage/storage-types';
import { getStorageHandler } from '$lib/data/storage/storage-handler-factory';
import { MergeMode } from '$lib/data/merge-mode';
import { ReplicationSaveBehavior } from '$lib/functions/replication/replication-options';
import { database } from '$lib/data/store';
import {
  cloudConnection$,
  cloudHealth$,
  type CloudConnectionState,
  type CloudProviderType
} from '$lib/data/sync/sync-store';
import { logger } from '$lib/data/logger';

type SubjectReader<T> = { getValue(): T };
function read<T>(s: unknown): T {
  return (s as SubjectReader<T>).getValue();
}

function cloudSourceName(provider: CloudProviderType, custom: boolean): string {
  if (provider === StorageKey.GDRIVE) {
    return custom ? 'miwake-gdrive-custom' : StorageSourceDefault.GDRIVE_DEFAULT;
  }
  return custom ? 'miwake-onedrive-custom' : StorageSourceDefault.ONEDRIVE_DEFAULT;
}

/**
 * Given a list of book cards from a remote sync location, write a
 * placeholder row into local IndexedDB for any title that isn't
 * already present. Returns the count of newly-created placeholders.
 * The caller decides whether to nudge dataListChanged$ (we don't, so
 * the bulk-update path can batch).
 */
export async function ensurePlaceholders(
  remoteCards: ReadonlyArray<{
    title: string;
    characters?: number;
    lastBookModified?: number;
  }>,
  storageSourceName: string
): Promise<number> {
  let touched = 0;

  // Look up all currently-registered storage-source names once so we
  // can detect placeholders whose `storageSource` points at a record
  // that no longer exists (e.g. user disconnected OneDrive and
  // connected GDrive instead — existing placeholders get orphaned).
  const db = await database.db;
  const liveSourceNames = new Set((await db.getAll('storageSource')).map((s) => s.name));

  for (const card of remoteCards) {
    const existing = await database.getDataByTitle(card.title);

    if (existing) {
      // Repoint orphaned placeholders at the current source so their
      // download-on-click flow works again.
      const isOrphanedPlaceholder =
        !existing.elementHtml &&
        existing.storageSource &&
        !liveSourceNames.has(existing.storageSource);
      const notYetAssigned = !existing.elementHtml && !existing.storageSource;

      logger.debug(
        `ensurePlaceholders: existing match for ${JSON.stringify(existing.title)} — ` +
          `hasHtml=${!!existing.elementHtml}, ` +
          `storageSource=${JSON.stringify(existing.storageSource ?? null)}, ` +
          `orphaned=${isOrphanedPlaceholder}, notYetAssigned=${notYetAssigned}`
      );

      if (isOrphanedPlaceholder || notYetAssigned) {
        await db.put('data', { ...existing, storageSource: storageSourceName });
        touched += 1;
      }
      continue;
    }

    logger.debug(
      `ensurePlaceholders: no local record for ${JSON.stringify(card.title)}, creating placeholder`
    );

    await database.upsertData(
      {
        title: card.title,
        elementHtml: '',
        styleSheet: '',
        blobs: {},
        coverImage: '',
        hasThumb: false,
        characters: card.characters || 0,
        sections: [],
        lastBookModified: card.lastBookModified || 0,
        lastBookOpen: 0,
        storageSource: storageSourceName
      },
      ReplicationSaveBehavior.NewOnly,
      true,
      /* removeStorageContext */ false
    );
    touched += 1;
  }

  return touched;
}

/**
 * Remove local placeholder rows whose `storageSource` points at a
 * record that no longer exists in the storage-source table AND whose
 * title is not in the current remote list. Those books are
 * unreachable — the source they came from is disconnected, and they
 * aren't on whatever source is currently being reconciled, so there
 * is no way for the user to download them.
 *
 * Deliberately conservative: only touches rows without `elementHtml`
 * (never deletes an actually-downloaded book) and only rows whose
 * storageSource is non-empty and orphaned (never deletes a local
 * import with no sync source attached).
 */
export async function pruneOrphanedPlaceholders(currentRemoteTitles: Set<string>): Promise<number> {
  const db = await database.db;
  const liveSourceNames = new Set((await db.getAll('storageSource')).map((s) => s.name));
  const allBooks = await db.getAll('data');

  let pruned = 0;
  for (const book of allBooks) {
    const isPlaceholder = !book.elementHtml;
    const hasOrphanedSource = !!book.storageSource && !liveSourceNames.has(book.storageSource);
    const reachableOnCurrentRemote = currentRemoteTitles.has(book.title);

    if (isPlaceholder && hasOrphanedSource && !reachableOnCurrentRemote) {
      await db.delete('data', book.id);
      pruned += 1;
    }
  }

  return pruned;
}

/**
 * Boot-time reconciliation: for each connected cloud source, pull the
 * remote book list and write placeholder rows into local IndexedDB for
 * any books that don't already exist there. The user's /manage view
 * then shows them with the cloud-download icon; clicking routes through
 * the source's handler to fetch the actual content.
 *
 * Auth is silent-only — if the cached refresh token is stale or
 * missing, we surface `reauth-required` on the health state rather
 * than popping a blocked-window dialog. The status indicator handles
 * the user-gesture reconnect and the ambient engine can be re-run on
 * next app open (or we can wire an explicit retry hook later).
 *
 * This is the _minimum_ viable Phase 4: no push-on-local-edit, no
 * full replacement of the reader's replicator$ pipeline yet — just
 * enough to make "books I added on another device" show up in
 * /manage on app boot.
 */
export async function reconcileCloudBooks(): Promise<void> {
  const cloud = read<CloudConnectionState | null>(cloudConnection$);
  if (!cloud) return;

  const name = cloudSourceName(cloud.provider, cloud.usesCustomCredentials);

  const handler: GDriveStorageHandler | OneDriveStorageHandler =
    cloud.provider === StorageKey.GDRIVE
      ? getStorageHandler(
          window,
          StorageKey.GDRIVE,
          name,
          false,
          false,
          ReplicationSaveBehavior.NewOnly,
          MergeMode.MERGE,
          MergeMode.MERGE,
          false
        )
      : getStorageHandler(
          window,
          StorageKey.ONEDRIVE,
          name,
          false,
          false,
          ReplicationSaveBehavior.NewOnly,
          MergeMode.MERGE,
          MergeMode.MERGE,
          false
        );

  try {
    // Silent auth. Uses the stored refresh token if present; throws
    // NeedsInteractiveAuthError otherwise.
    await handler.authenticate(null, true);

    const remoteBooks = await handler.getBookList();
    logger.debug(
      `reconcileCloudBooks: ${name} returned ${remoteBooks.length} remote book(s): ` +
        remoteBooks.map((b) => JSON.stringify(b.title)).join(', ')
    );

    const touched = await ensurePlaceholders(remoteBooks, name);

    // Prune local placeholders that reference a disconnected source
    // AND aren't on the currently-reconciling source — those are
    // ghosts from a past sync location that the user disconnected,
    // with no way to download them.
    const remoteTitles = new Set(remoteBooks.map((b) => b.title));
    const pruned = await pruneOrphanedPlaceholders(remoteTitles);
    logger.debug(`reconcileCloudBooks: touched=${touched}, pruned=${pruned}`);

    if (touched > 0 || pruned > 0) {
      // Nudge /manage to re-fetch the dataList so changes appear.
      database.dataListChanged$.next(undefined);
    }

    cloudHealth$.next({ status: 'ok' });
  } catch (err) {
    if (err instanceof NeedsInteractiveAuthError) {
      cloudHealth$.next({
        status: 'reauth-required',
        summary: 'Sign-in expired',
        detail:
          'Reconnect your cloud account to resume syncing. Your data on the cloud is unchanged.'
      });
      return;
    }

    logger.warn(`reconcileCloudBooks failed: ${err instanceof Error ? err.message : String(err)}`);
    cloudHealth$.next({
      status: 'error',
      summary: "Couldn't read your cloud library",
      detail: err instanceof Error ? err.message : String(err)
    });
  }
}

/**
 * Run once on app boot. Reconciles connected sync locations with
 * local IndexedDB. Safe to call multiple times — each invocation is
 * independent.
 */
export async function syncEngineStart(): Promise<void> {
  await reconcileCloudBooks();
  // FS reconciliation is a future pass — the existing replicator
  // handles it indirectly, and the FS picker creates its own record.
}
