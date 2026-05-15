<script module lang="ts">
  import SyncLeaveDialog from '$lib/components/settings/sync/sync-leave-dialog.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
  import type { SyncLocation } from '$lib/data/sync/sync-store.svelte';

  /**
   * Confirmation for a destructive sync state change: either
   * disconnecting (no successor) or switching to a different
   * destination. Either way the prior destination's link goes away;
   * the user picks whether their on-device library survives.
   */
  export type SyncLeaveResult = { kind: 'cancel' } | { kind: 'confirm'; clearLibrary: boolean };

  export function showSyncLeaveDialog(params: {
    /** The location being left. Required so we can describe it. */
    leaving: SyncLocation;
    /**
     * The target after the change. `null` = disconnect, no successor.
     * Otherwise a label describing what the user is switching to
     * ("Google Drive", "your sync folder", etc.).
     */
    nextLabel: string | null;
    /** Books on this device that have been fully downloaded (have content). */
    downloadedCount: number;
    /** Placeholder rows for books at the source that were never downloaded. */
    placeholderCount: number;
  }): Promise<SyncLeaveResult> {
    let clearLibrary = false;
    return showDialog<SyncLeaveResult>(
      SyncLeaveDialog,
      {
        leaving: params.leaving,
        nextLabel: params.nextLabel,
        downloadedCount: params.downloadedCount,
        placeholderCount: params.placeholderCount,
        captureClearLibrary: (v: boolean) => {
          clearLibrary = v;
        }
      },
      {
        closedBy: 'closerequest',
        resolveResult: (returnValue) =>
          returnValue === 'confirm' ? { kind: 'confirm', clearLibrary } : { kind: 'cancel' }
      }
    );
  }
</script>

<script lang="ts">
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import { describeSyncLocation } from '$lib/components/settings/sync/sync-utils';

  interface Props {
    leaving: SyncLocation;
    nextLabel: string | null;
    downloadedCount: number;
    placeholderCount: number;
    captureClearLibrary: (v: boolean) => void;
  }

  let { leaving, nextLabel, downloadedCount, placeholderCount, captureClearLibrary }: Props =
    $props();

  let clearLibrary = $state(false);

  // "your sync folder" reads better than "your local folder" when paired
  // with "your library" — both are local, but the folder is the *sync
  // target* while the library is what the reader opens.
  let leavingLabel = $derived(
    leaving.kind === 'fs' ? 'your sync folder' : describeSyncLocation(leaving)
  );

  let title = $derived(
    nextLabel === null ? `Disconnect ${leavingLabel}?` : `Switch to ${nextLabel}?`
  );

  let confirmLabel = $derived(nextLabel === null ? 'Disconnect' : `Switch to ${nextLabel}`);

  let bodyText = $derived(
    nextLabel === null
      ? `This device will stop syncing with ${leavingLabel}.`
      : `This device will sign out of ${leavingLabel} before connecting to ${nextLabel}.`
  );
  let sourceUntouched = $derived(
    leaving.kind === 'fs'
      ? 'Files in the folder are not touched.'
      : 'Data in the cloud account is not touched.'
  );

  function plural(n: number, singular: string, plural: string): string {
    return `${n} ${n === 1 ? singular : plural}`;
  }

  let downloadedFate = $derived(() => {
    if (downloadedCount === 0) return null;
    const subject = plural(downloadedCount, 'downloaded book', 'downloaded books');
    if (nextLabel === null) {
      return downloadedCount === 1
        ? `${subject} stays in your library unless you wipe it below.`
        : `${subject} stay in your library unless you wipe them below.`;
    }
    return downloadedCount === 1
      ? `${subject} syncs up to ${nextLabel} unless you wipe it below.`
      : `${subject} sync up to ${nextLabel} unless you wipe them below.`;
  });

  let placeholderFate = $derived(() => {
    if (placeholderCount === 0) return null;
    const subject = plural(placeholderCount, 'book', 'books');
    if (placeholderCount === 1) {
      return `${subject} that lives only at ${leavingLabel} drops from your library here. Reconnect ${leavingLabel} later to get it back.`;
    }
    return `${subject} that live only at ${leavingLabel} drop from your library here. Reconnect ${leavingLabel} later to get them back.`;
  });

  $effect(() => {
    captureClearLibrary(clearLibrary);
  });
</script>

<div class="w-120 max-w-full">
  <header class="border-b border-black/10 pb-4">
    <h2 class="text-xl font-medium">{title}</h2>
    <p class="mt-2 text-sm text-gray-700">{bodyText} {sourceUntouched}</p>
  </header>

  <div class="py-4">
    {#if downloadedCount > 0 || placeholderCount > 0}
      <div class="px-2 text-sm text-gray-700">What happens to your library on this device:</div>
      <ul class="mt-2 ml-2 space-y-2 text-sm text-gray-700">
        {#if downloadedFate()}
          <li class="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{downloadedFate()}</span>
          </li>
        {/if}
        {#if placeholderFate()}
          <li class="flex gap-2">
            <span aria-hidden="true">•</span>
            <span>{placeholderFate()}</span>
          </li>
        {/if}
      </ul>

      {#if downloadedCount > 0}
        <label class="mt-4 flex items-start gap-3 rounded p-2 text-sm hover:bg-gray-400/15">
          <input type="checkbox" class="mt-1" bind:checked={clearLibrary} />
          <div>
            <div class="font-medium">
              Also wipe my library on this device ({plural(downloadedCount, 'book', 'books')})
            </div>
            <div class="text-xs text-gray-600">
              Deletes the downloaded books, bookmarks, and reading statistics from this device. Use
              this for a clean slate{nextLabel === null ? '.' : ` at ${nextLabel}.`}
            </div>
          </div>
        </label>
      {/if}
    {:else}
      <p class="px-2 text-sm text-gray-600">
        Your library is empty on this device — nothing to wipe.
      </p>
    {/if}
  </div>

  <footer class="flex items-center justify-end gap-2 border-t border-black/10 pt-4">
    <form method="dialog" class="m-0 flex gap-2">
      <SyncButton type="submit" value="cancel">Cancel</SyncButton>
      <SyncButton type="submit" value="confirm" variant={clearLibrary ? 'danger' : 'primary'}>
        {confirmLabel}{clearLibrary ? ' and wipe' : ''}
      </SyncButton>
    </form>
  </footer>
</div>
