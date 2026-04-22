<script lang="ts">
  import { appName } from '$lib/data/env';
  import { confirmDialog, messageDialog } from '$lib/data/simple-dialogs';
  import { fsConnection$, fsHealth$ } from '$lib/data/sync/sync-store';
  import { connectFs, disconnectFs } from '$lib/data/sync/source-manager';
  import { formatRelativeTime } from '$lib/components/settings/sync/sync-utils';
  import SyncAlert from '$lib/components/settings/sync/sync-alert.svelte';
  import SyncBadge from '$lib/components/settings/sync/sync-badge.svelte';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import SyncRow from '$lib/components/settings/sync/sync-row.svelte';
  import SyncSection from '$lib/components/settings/sync/sync-section.svelte';

  let active = $derived($fsConnection$);
  let busy = $state(false);

  async function onChoose() {
    if (busy) return;
    busy = true;
    try {
      await connectFs();
    } catch (err) {
      // Picker cancel is silent; other errors surface.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        await messageDialog({
          title: "Couldn't connect local folder",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    } finally {
      busy = false;
    }
  }

  async function onDisconnect() {
    const cancelled = await confirmDialog({
      title: 'Disconnect local folder?',
      message: `${appName} will stop mirroring to this folder. Files already written remain on disk.`
    });
    if (cancelled) return;
    busy = true;
    try {
      await disconnectFs();
    } finally {
      busy = false;
    }
  }

  async function onGrantAccess() {
    // Grant access is the same flow as choose-folder; the permission
    // prompt happens inside showDirectoryPicker when appropriate.
    await onChoose();
  }

  async function onRetry() {
    $fsHealth$ = { status: 'ok' };
  }
</script>

<SyncSection
  title="File system sync"
  description="Mirror your library to a local folder on this device."
>
  {#if !active}
    <SyncRow first>
      {#snippet main()}
        <div class="font-medium">Local folder</div>
        <div class="mt-1 text-sm text-gray-600">Not configured</div>
      {/snippet}
      {#snippet actions()}
        <SyncButton variant="primary" disabled={busy} onclick={onChoose}>Choose folder</SyncButton>
      {/snippet}
    </SyncRow>
  {:else}
    <SyncRow first>
      {#snippet main()}
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">Local folder</span>
          {#if $fsHealth$.status === 'ok'}
            <SyncBadge variant="success">Connected</SyncBadge>
          {:else if $fsHealth$.status === 'permission-required'}
            <SyncBadge variant="warning">Permission required</SyncBadge>
          {:else if $fsHealth$.status === 'error'}
            <SyncBadge variant="danger">Sync failed</SyncBadge>
          {/if}
        </div>
        <div class="mt-1 font-mono text-xs text-gray-600">{active.path}</div>
        {#if $fsHealth$.status === 'ok'}
          <div class="text-sm text-gray-600">
            {#if active.lastSyncedAt === null}
              Not yet synced
            {:else}
              Synced {formatRelativeTime(active.lastSyncedAt)}
            {/if}
          </div>
        {/if}
        {#if $fsHealth$.status === 'reauth-required' || $fsHealth$.status === 'permission-required'}
          <SyncAlert variant="warning" summary={$fsHealth$.summary} detail={$fsHealth$.detail} />
        {:else if $fsHealth$.status === 'error'}
          <SyncAlert
            variant="danger"
            summary={$fsHealth$.summary}
            detail={$fsHealth$.detail}
            technicalDetail={$fsHealth$.technicalDetail}
          />
        {/if}
      {/snippet}
      {#snippet actions()}
        {#if $fsHealth$.status === 'permission-required' || $fsHealth$.status === 'reauth-required'}
          <SyncButton variant="warning" onclick={onGrantAccess}>Grant access</SyncButton>
        {:else if $fsHealth$.status === 'error'}
          <SyncButton onclick={onRetry}>Retry</SyncButton>
        {:else}
          <SyncButton onclick={onChoose}>Change folder</SyncButton>
          <SyncButton onclick={onDisconnect}>Disconnect</SyncButton>
        {/if}
      {/snippet}
    </SyncRow>
  {/if}
</SyncSection>
