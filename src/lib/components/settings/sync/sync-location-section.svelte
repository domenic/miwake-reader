<script lang="ts">
  import { browser } from '$app/environment';
  import { appName } from '$lib/data/env';
  import { messageDialog } from '$lib/data/simple-dialogs';
  import { SyncEndpointType } from '$lib/data/storage/storage-types';
  import { database } from '$lib/data/store';
  import {
    cloudCustomCredentials$,
    now$,
    syncHealth$,
    syncLocation$,
    type CloudProviderType
  } from '$lib/data/sync/sync-store';
  import {
    connectCloud,
    connectFs,
    disconnect,
    switchToCloud,
    switchToFs
  } from '$lib/data/sync/source-manager';
  import { retryAfterReconnect } from '$lib/data/sync/sync-engine';
  import { formatRelativeTime, providerLabel } from '$lib/components/settings/sync/sync-utils';
  import SyncAlert from '$lib/components/settings/sync/sync-alert.svelte';
  import SyncBadge from '$lib/components/settings/sync/sync-badge.svelte';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import SyncRow from '$lib/components/settings/sync/sync-row.svelte';
  import SyncSection from '$lib/components/settings/sync/sync-section.svelte';
  import { showCustomOAuthDialog } from '$lib/components/settings/sync/custom-oauth-dialog.svelte';
  import { showSyncLeaveDialog } from '$lib/components/settings/sync/sync-leave-dialog.svelte';

  // Hide the FS option entirely on browsers without showDirectoryPicker
  // (Firefox as of 2026) so unsupported users don't see a button that
  // would throw on click.
  let supportsFsPicker = $derived(browser && 'showDirectoryPicker' in window);

  let active = $derived($syncLocation$);
  let busy = $state(false);

  // Cloud-active variant — narrowed for template ergonomics.
  let activeCloud = $derived(active?.kind === 'cloud' ? active : null);
  let activeFs = $derived(active?.kind === 'fs' ? active : null);

  function toProvider(target: 'gdrive' | 'onedrive'): CloudProviderType {
    return target === 'gdrive' ? SyncEndpointType.GDRIVE : SyncEndpointType.ONEDRIVE;
  }

  /** Counts of what's in the library, split by status. Both numbers
   *  feed the leave-dialog so the user sees what happens on disconnect:
   *  downloaded books stay (or get wiped on opt-in); placeholders get
   *  pruned regardless because there's no longer a source to fetch
   *  them from. */
  async function countLibraryBooks(): Promise<{ downloaded: number; placeholders: number }> {
    const db = await database.db;
    const all = await db.getAll('data');
    let downloaded = 0;
    let placeholders = 0;
    for (const book of all) {
      if (book.elementHtml) downloaded += 1;
      else placeholders += 1;
    }
    return { downloaded, placeholders };
  }

  function targetLabelFor(target: 'gdrive' | 'onedrive' | 'fs'): string {
    return target === 'fs' ? 'your sync folder' : providerLabel(toProvider(target));
  }

  /**
   * The user picked a destination from the alternatives list. If a
   * different location is currently active, confirm the destructive
   * switch first — and offer to wipe this device's library at the
   * same time, since switching might otherwise mirror downloaded
   * books over to a destination the user thought of as a clean slate.
   */
  async function onPick(target: 'gdrive' | 'onedrive' | 'fs') {
    if (busy) return;
    const targetLabel = targetLabelFor(target);

    let clearLibrary = false;
    if (active) {
      const counts = await countLibraryBooks();
      const result = await showSyncLeaveDialog({
        leaving: active,
        nextLabel: targetLabel,
        downloadedCount: counts.downloaded,
        placeholderCount: counts.placeholders
      });
      if (result.kind === 'cancel') return;
      clearLibrary = result.clearLibrary;
    }

    busy = true;
    try {
      if (target === 'fs') {
        await switchToFs({ clearLibrary });
      } else {
        await switchToCloud(toProvider(target), { clearLibrary });
      }
    } catch (err) {
      // Picker cancel is silent; other errors surface.
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        await messageDialog({
          title: `Couldn't connect to ${targetLabel}`,
          message: err instanceof Error ? err.message : String(err)
        });
      }
    } finally {
      busy = false;
    }
  }

  async function onDisconnect() {
    if (!active) return;
    const counts = await countLibraryBooks();
    const result = await showSyncLeaveDialog({
      leaving: active,
      nextLabel: null,
      downloadedCount: counts.downloaded,
      placeholderCount: counts.placeholders
    });
    if (result.kind === 'cancel') return;
    busy = true;
    try {
      await disconnect({ clearLibrary: result.clearLibrary });
    } finally {
      busy = false;
    }
  }

  async function onReconnect() {
    if (!activeCloud) return;
    busy = true;
    try {
      await connectCloud(activeCloud.provider);
      await retryAfterReconnect();
    } catch (err) {
      await messageDialog({
        title: "Couldn't reconnect",
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      busy = false;
    }
  }

  async function onGrantFsAccess() {
    // Re-running the picker is the only way to get a fresh permission
    // grant in a user-activation context.
    busy = true;
    try {
      await connectFs();
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        await messageDialog({
          title: "Couldn't grant folder access",
          message: err instanceof Error ? err.message : String(err)
        });
      }
    } finally {
      busy = false;
    }
  }

  async function onRetry() {
    if (busy) return;
    busy = true;
    try {
      await retryAfterReconnect();
    } finally {
      busy = false;
    }
  }

  async function onUseCustom(provider: CloudProviderType) {
    const stored = $cloudCustomCredentials$[provider];
    const isActive = activeCloud?.provider === provider && activeCloud.usesCustomCredentials;
    const result = await showCustomOAuthDialog({
      provider,
      providerLabel: providerLabel(provider),
      isActive,
      hasStoredCredentials: !!stored,
      initialClientId: stored?.clientId,
      initialClientSecret: stored?.clientSecret,
      initialTokenEndpoint: stored?.tokenEndpoint
    });

    if (result.kind === 'cancel') return;

    if (result.kind === 'clear') {
      const next = { ...$cloudCustomCredentials$ };
      delete next[provider];
      $cloudCustomCredentials$ = next;
      if (activeCloud?.provider === provider && activeCloud.usesCustomCredentials) {
        await disconnect();
      }
      return;
    }

    if (result.kind === 'revert-to-default') {
      if (activeCloud?.provider === provider && activeCloud.usesCustomCredentials) {
        // Switch the active connection from custom to default OAuth,
        // but keep the user's stored custom creds for later. The
        // useCustomCredentials override is required because
        // switchToCloud would otherwise re-derive useCustom=true from
        // the still-stored creds. acquire-first ordering inside
        // switchToCloud means a popup-blocked / canceled revert
        // leaves the user on their existing custom connection.
        await switchToCloud(provider, { useCustomCredentials: false });
      }
      return;
    }

    $cloudCustomCredentials$ = {
      ...$cloudCustomCredentials$,
      [provider]: result.credentials
    };

    if (result.activate) {
      // switchToCloud handles the no-active and switch-from-other
      // cases identically, opening the popup synchronously and only
      // tearing down the prior connection after the new one is
      // verified. Replaces the previous disconnect-then-connect that
      // could strand the user on a popup-blocked attempt.
      await switchToCloud(provider);
    }
  }
</script>

<SyncSection
  title="Sync location"
  description="Pick one place to mirror your library, bookmarks, and reading data so it follows you across devices."
>
  {#if !active}
    {#if browser}
      <SyncRow first>
        {#snippet main()}
          <div class="font-medium">Google Drive</div>
          <div class="mt-1 text-sm text-gray-600">
            Sync to a folder in your Google Drive account.
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span
              >Using {$cloudCustomCredentials$[SyncEndpointType.GDRIVE]
                ? 'your stored custom'
                : `${appName}'s default`} OAuth app.</span
            >
            <button
              type="button"
              class="cursor-pointer text-gray-600 underline hover:text-black"
              onclick={() => onUseCustom(SyncEndpointType.GDRIVE)}
              >{$cloudCustomCredentials$[SyncEndpointType.GDRIVE]
                ? 'Manage credentials'
                : 'Use custom credentials'}</button
            >
          </div>
        {/snippet}
        {#snippet actions()}
          <SyncButton variant="primary" disabled={busy} onclick={() => onPick('gdrive')}>
            Connect
          </SyncButton>
        {/snippet}
      </SyncRow>

      <SyncRow>
        {#snippet main()}
          <div class="font-medium">OneDrive</div>
          <div class="mt-1 text-sm text-gray-600">
            Sync to a folder in your Microsoft OneDrive account.
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span
              >Using {$cloudCustomCredentials$[SyncEndpointType.ONEDRIVE]
                ? 'your stored custom'
                : `${appName}'s default`} OAuth app.</span
            >
            <button
              type="button"
              class="cursor-pointer text-gray-600 underline hover:text-black"
              onclick={() => onUseCustom(SyncEndpointType.ONEDRIVE)}
              >{$cloudCustomCredentials$[SyncEndpointType.ONEDRIVE]
                ? 'Manage credentials'
                : 'Use custom credentials'}</button
            >
          </div>
        {/snippet}
        {#snippet actions()}
          <SyncButton variant="primary" disabled={busy} onclick={() => onPick('onedrive')}>
            Connect
          </SyncButton>
        {/snippet}
      </SyncRow>

      {#if supportsFsPicker}
        <SyncRow>
          {#snippet main()}
            <div class="font-medium">Sync folder</div>
            <div class="mt-1 text-sm text-gray-600">
              Mirror your library to a folder on this device. Pair with your own sync tool
              (Syncthing, Dropbox, etc.) for cross-device coverage.
            </div>
          {/snippet}
          {#snippet actions()}
            <SyncButton variant="primary" disabled={busy} onclick={() => onPick('fs')}>
              Choose folder
            </SyncButton>
          {/snippet}
        </SyncRow>
      {/if}
    {/if}
  {:else if activeCloud}
    <SyncRow first>
      {#snippet main()}
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{providerLabel(activeCloud.provider)}</span>
          {#if $syncHealth$.status === 'ok'}
            <SyncBadge variant="success">Connected</SyncBadge>
          {:else if $syncHealth$.status === 'reauth-required'}
            <SyncBadge variant="warning">Reconnect required</SyncBadge>
          {:else if $syncHealth$.status === 'error'}
            <SyncBadge variant="danger">Sync failed</SyncBadge>
          {/if}
          {#if activeCloud.usesCustomCredentials}
            <SyncBadge variant="info">Custom OAuth</SyncBadge>
          {/if}
        </div>
        <div class="mt-1 text-sm text-gray-600">
          {#if activeCloud.lastSyncedAt === null}
            Not yet synced
          {:else if $syncHealth$.status === 'ok'}
            Synced {formatRelativeTime(activeCloud.lastSyncedAt, $now$)}
          {:else}
            Last successful sync {formatRelativeTime(activeCloud.lastSyncedAt, $now$)}
          {/if}
          {#if activeCloud.bookCount !== null}
            · {activeCloud.bookCount} book{activeCloud.bookCount === 1 ? '' : 's'}
          {/if}
        </div>
        {#if $syncHealth$.status === 'reauth-required' || $syncHealth$.status === 'permission-required'}
          <SyncAlert
            variant="warning"
            summary={$syncHealth$.summary}
            detail={$syncHealth$.detail}
          />
        {:else if $syncHealth$.status === 'error'}
          <SyncAlert
            variant="danger"
            summary={$syncHealth$.summary}
            detail={$syncHealth$.detail}
            technicalDetail={$syncHealth$.technicalDetail}
          />
        {/if}
        <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span
            >Using {activeCloud.usesCustomCredentials ? 'your' : `${appName}'s default`} OAuth app.</span
          >
          <button
            type="button"
            class="cursor-pointer text-gray-600 underline hover:text-black"
            onclick={() => onUseCustom(activeCloud!.provider)}
            >{activeCloud.usesCustomCredentials
              ? 'Manage credentials'
              : 'Use custom credentials'}</button
          >
        </div>
      {/snippet}
      {#snippet actions()}
        {#if $syncHealth$.status === 'reauth-required' || $syncHealth$.status === 'permission-required'}
          <SyncButton variant="warning" onclick={onReconnect}>Reconnect</SyncButton>
        {:else if $syncHealth$.status === 'error'}
          <SyncButton onclick={onRetry}>Retry</SyncButton>
        {:else}
          <SyncButton onclick={onDisconnect}>Disconnect</SyncButton>
        {/if}
      {/snippet}
    </SyncRow>

    <SyncRow>
      {#snippet main()}
        <div class="text-xs text-gray-500">
          Switching destinations signs you out of {providerLabel(activeCloud.provider)} on this device.
          Your library on this device will sync up to the new destination unless you wipe it during the
          switch.
        </div>
      {/snippet}
      {#snippet actions()}
        <div class="flex flex-wrap gap-2">
          {#if activeCloud.provider !== SyncEndpointType.GDRIVE}
            <SyncButton disabled={busy} onclick={() => onPick('gdrive')}>
              Switch to Google Drive
            </SyncButton>
          {/if}
          {#if activeCloud.provider !== SyncEndpointType.ONEDRIVE}
            <SyncButton disabled={busy} onclick={() => onPick('onedrive')}>
              Switch to OneDrive
            </SyncButton>
          {/if}
          {#if supportsFsPicker}
            <SyncButton disabled={busy} onclick={() => onPick('fs')}>
              Switch to a sync folder
            </SyncButton>
          {/if}
        </div>
      {/snippet}
    </SyncRow>
  {:else if activeFs}
    <SyncRow first>
      {#snippet main()}
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">Sync folder</span>
          {#if $syncHealth$.status === 'ok'}
            <SyncBadge variant="success">Connected</SyncBadge>
          {:else if $syncHealth$.status === 'permission-required'}
            <SyncBadge variant="warning">Permission required</SyncBadge>
          {:else if $syncHealth$.status === 'error'}
            <SyncBadge variant="danger">Sync failed</SyncBadge>
          {/if}
        </div>
        <div class="mt-1 font-mono text-xs text-gray-600">{activeFs.path}</div>
        {#if $syncHealth$.status === 'ok'}
          <div class="text-sm text-gray-600">
            {#if activeFs.lastSyncedAt === null}
              Not yet synced
            {:else}
              Synced {formatRelativeTime(activeFs.lastSyncedAt, $now$)}
            {/if}
          </div>
        {/if}
        {#if $syncHealth$.status === 'reauth-required' || $syncHealth$.status === 'permission-required'}
          <SyncAlert
            variant="warning"
            summary={$syncHealth$.summary}
            detail={$syncHealth$.detail}
          />
        {:else if $syncHealth$.status === 'error'}
          <SyncAlert
            variant="danger"
            summary={$syncHealth$.summary}
            detail={$syncHealth$.detail}
            technicalDetail={$syncHealth$.technicalDetail}
          />
        {/if}
      {/snippet}
      {#snippet actions()}
        {#if $syncHealth$.status === 'permission-required' || $syncHealth$.status === 'reauth-required'}
          <SyncButton variant="warning" onclick={onGrantFsAccess}>Grant access</SyncButton>
        {:else if $syncHealth$.status === 'error'}
          <SyncButton onclick={onRetry}>Retry</SyncButton>
        {:else}
          <SyncButton onclick={() => onPick('fs')}>Change folder</SyncButton>
          <SyncButton onclick={onDisconnect}>Disconnect</SyncButton>
        {/if}
      {/snippet}
    </SyncRow>

    <SyncRow>
      {#snippet main()}
        <div class="text-xs text-gray-500">
          Switching destinations stops mirroring to your sync folder; files already there stay on
          disk. Your library on this device will sync up to the new destination unless you wipe it
          during the switch.
        </div>
      {/snippet}
      {#snippet actions()}
        <div class="flex flex-wrap gap-2">
          <SyncButton disabled={busy} onclick={() => onPick('gdrive')}>
            Switch to Google Drive
          </SyncButton>
          <SyncButton disabled={busy} onclick={() => onPick('onedrive')}>
            Switch to OneDrive
          </SyncButton>
        </div>
      {/snippet}
    </SyncRow>
  {/if}
</SyncSection>
