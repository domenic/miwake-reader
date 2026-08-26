<script lang="ts">
  import { browser } from '$app/environment';
  import { appName } from '$lib/data/env';
  import { showErrorDialog } from '$lib/components/log-report-dialog.svelte';
  import { SyncEndpointType } from '$lib/data/storage/storage-types';
  import { database } from '$lib/data/store';
  import {
    cloudCustomCredentials$,
    syncState,
    type CloudProviderType
  } from '$lib/data/sync/sync-store.svelte';
  import { connectCloud, connectFs, disconnect } from '$lib/data/sync/source-manager';
  import { retryAfterReconnect } from '$lib/data/sync/sync-engine';
  import { providerLabel } from '$lib/components/settings/sync/sync-utils';
  import SyncAlert from '$lib/components/settings/sync/sync-alert.svelte';
  import SyncBadge from '$lib/components/settings/sync/sync-badge.svelte';
  import SettingsButton from '$lib/components/settings/settings-button.svelte';
  import SettingsItem from '$lib/components/settings/settings-item.svelte';
  import SyncLastSyncedTime from '$lib/components/settings/sync/sync-last-synced-time.svelte';
  import SettingsSection from '$lib/components/settings/settings-section.svelte';
  import { showCustomOAuthDialog } from '$lib/components/settings/sync/custom-oauth-dialog.svelte';
  import { showSyncLeaveDialog } from '$lib/components/settings/sync/sync-leave-dialog.svelte';

  // Hide the FS option entirely on browsers without showDirectoryPicker
  // (Firefox as of 2026) so unsupported users don't see a button that
  // would throw on click.
  let supportsFsPicker = $derived(browser && 'showDirectoryPicker' in window);

  let active = $derived(syncState.location);
  let health = $derived(syncState.health);
  let busy = $state(false);

  // Cloud-active variant — narrowed for template ergonomics.
  let activeCloud = $derived(active?.kind === 'cloud' ? active : null);
  let activeFs = $derived(active?.kind === 'fs' ? active : null);

  const cloudProviders = [
    {
      provider: SyncEndpointType.GDRIVE,
      description: 'Syncs to a folder in your Google Drive account.'
    },
    {
      provider: SyncEndpointType.ONEDRIVE,
      description: 'Syncs to a folder in your Microsoft OneDrive account.'
    }
  ] as const satisfies readonly {
    provider: CloudProviderType;
    description: string;
  }[];

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

  function targetLabelFor(target: CloudProviderType | SyncEndpointType.FS): string {
    return target === SyncEndpointType.FS ? 'your sync folder' : providerLabel(target);
  }

  /**
   * The user picked a destination from the alternatives list. If a
   * different location is currently active, confirm the destructive
   * switch first — and offer to wipe this device's library at the
   * same time, since switching might otherwise mirror downloaded
   * books over to a destination the user thought of as a clean slate.
   */
  async function onPick(target: CloudProviderType | SyncEndpointType.FS) {
    if (busy) return;
    const targetLabel = targetLabelFor(target);

    busy = true;
    try {
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

      if (target === SyncEndpointType.FS) {
        await connectFs({ clearLibrary });
      } else {
        await connectCloud(target, {
          clearLibrary,
          // The UI shows "Using your stored custom OAuth app" when
          // creds are present; matching that hint here.
          useCustomCredentials: !!$cloudCustomCredentials$[target]
        });
      }
    } catch (error) {
      await showErrorDialog({ title: `Error connecting to ${targetLabel}`, error });
    } finally {
      busy = false;
    }
  }

  async function onDisconnect() {
    if (busy || !active) return;
    busy = true;
    try {
      const counts = await countLibraryBooks();
      const result = await showSyncLeaveDialog({
        leaving: active,
        nextLabel: null,
        downloadedCount: counts.downloaded,
        placeholderCount: counts.placeholders
      });
      if (result.kind === 'cancel') return;
      await disconnect({ clearLibrary: result.clearLibrary });
    } catch (error) {
      await showErrorDialog({ title: 'Error disconnecting sync location', error });
    } finally {
      busy = false;
    }
  }

  async function onReconnect() {
    if (busy || !activeCloud) return;
    busy = true;
    try {
      await connectCloud(activeCloud.provider, {
        useCustomCredentials: activeCloud.usesCustomCredentials
      });
      await retryAfterReconnect();
    } catch (error) {
      await showErrorDialog({ title: 'Error reconnecting to sync location', error });
    } finally {
      busy = false;
    }
  }

  async function onGrantFsAccess() {
    if (busy) return;
    // Re-running the picker is the only way to get a fresh permission
    // grant in a user-activation context.
    busy = true;
    try {
      await connectFs({ regrantCurrentSource: true });
    } catch (error) {
      await showErrorDialog({ title: 'Error granting folder access', error });
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
    if (busy) return;
    busy = true;
    try {
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
          // Force default mode while leaving stored custom creds in
          // place, so the user can re-Save them later without re-typing.
          await connectCloud(provider, { useCustomCredentials: false });
        }
        return;
      }

      $cloudCustomCredentials$ = {
        ...$cloudCustomCredentials$,
        [provider]: result.credentials
      };

      if (result.activate) {
        await connectCloud(provider, { useCustomCredentials: true });
      }
    } catch (error) {
      await showErrorDialog({
        title: `Error updating ${providerLabel(provider)} credentials`,
        error
      });
    } finally {
      busy = false;
    }
  }
</script>

<SettingsSection
  title="Sync location"
  description="Pick one place to mirror your library, bookmarks, and reading data so it follows you across devices."
>
  {#if !active}
    {#if browser}
      {#each cloudProviders as option (option.provider)}
        <SettingsItem label={providerLabel(option.provider)} description={option.description}>
          {#snippet control()}
            <SettingsButton disabled={busy} onclick={() => onPick(option.provider)}>
              Connect
            </SettingsButton>
          {/snippet}
          <div class="flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span
              >Using {$cloudCustomCredentials$[option.provider]
                ? 'your stored custom'
                : `${appName}'s default`} OAuth app.</span
            >
            <button
              type="button"
              class="text-gray-600 underline hover:text-black disabled:opacity-50"
              disabled={busy}
              onclick={() => onUseCustom(option.provider)}
              >{$cloudCustomCredentials$[option.provider]
                ? 'Manage credentials'
                : 'Use custom credentials'}</button
            >
          </div>
        </SettingsItem>
      {/each}

      {#if supportsFsPicker}
        <SettingsItem
          label="Sync folder"
          description="Mirrors your library to a folder on this device. Works with your own sync tool, such as Syncthing or Dropbox, for cross-device coverage."
        >
          {#snippet control()}
            <SettingsButton disabled={busy} onclick={() => onPick(SyncEndpointType.FS)}>
              Choose folder
            </SettingsButton>
          {/snippet}
        </SettingsItem>
      {/if}
    {/if}
  {:else if activeCloud}
    <SettingsItem label={providerLabel(activeCloud.provider)}>
      {#snippet control()}
        {#if health.status === 'reauth-required' || health.status === 'permission-required'}
          <SettingsButton variant="warning" disabled={busy} onclick={onReconnect}
            >Reconnect</SettingsButton
          >
        {:else if health.status === 'error'}
          <SettingsButton disabled={busy} onclick={onRetry}>Retry</SettingsButton>
        {:else}
          <SettingsButton disabled={busy} onclick={onDisconnect}>Disconnect</SettingsButton>
        {/if}
      {/snippet}
      <div class="flex flex-wrap items-center gap-2">
        {#if health.status === 'ok'}
          <SyncBadge variant="success">Connected</SyncBadge>
        {:else if health.status === 'reauth-required'}
          <SyncBadge variant="warning">Reconnect required</SyncBadge>
        {:else if health.status === 'error'}
          <SyncBadge variant="danger">Sync failed</SyncBadge>
        {/if}
        {#if activeCloud.usesCustomCredentials}
          <SyncBadge variant="info">Custom OAuth</SyncBadge>
        {/if}
        <span class="text-sm text-gray-600">
          {#if activeCloud.lastSyncedAt === null}
            Not yet synced
          {:else if health.status === 'ok'}
            Synced <SyncLastSyncedTime timestamp={activeCloud.lastSyncedAt} />
          {:else}
            Last successful sync <SyncLastSyncedTime timestamp={activeCloud.lastSyncedAt} />
          {/if}
          {#if activeCloud.bookCount !== null}
            · {activeCloud.bookCount} book{activeCloud.bookCount === 1 ? '' : 's'}
          {/if}
        </span>
      </div>
      {#if health.status === 'reauth-required' || health.status === 'permission-required'}
        <SyncAlert variant="warning" summary={health.summary} detail={health.detail} />
      {:else if health.status === 'error'}
        <SyncAlert
          variant="danger"
          summary={health.summary}
          detail={health.detail}
          technicalDetail={health.technicalDetail}
        />
      {/if}
      <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
        <span
          >Using {activeCloud.usesCustomCredentials ? 'your' : `${appName}'s default`} OAuth app.</span
        >
        <button
          type="button"
          class="text-gray-600 underline hover:text-black disabled:opacity-50"
          disabled={busy}
          onclick={() => onUseCustom(activeCloud!.provider)}
          >{activeCloud.usesCustomCredentials
            ? 'Manage credentials'
            : 'Use custom credentials'}</button
        >
      </div>
    </SettingsItem>

    <SettingsItem
      label="Change sync location"
      description={`Switching destinations signs you out of ${providerLabel(activeCloud.provider)} on this device. Your library on this device will sync up to the new destination unless you wipe it during the switch.`}
    >
      {#snippet control()}
        <div class="flex flex-wrap gap-2">
          {#each cloudProviders as option (option.provider)}
            {#if activeCloud.provider !== option.provider}
              <SettingsButton disabled={busy} onclick={() => onPick(option.provider)}>
                Switch to {providerLabel(option.provider)}
              </SettingsButton>
            {/if}
          {/each}
          {#if supportsFsPicker}
            <SettingsButton disabled={busy} onclick={() => onPick(SyncEndpointType.FS)}>
              Switch to a sync folder
            </SettingsButton>
          {/if}
        </div>
      {/snippet}
    </SettingsItem>
  {:else if activeFs}
    <SettingsItem label="Sync folder">
      {#snippet control()}
        {#if health.status === 'permission-required' || health.status === 'reauth-required'}
          <SettingsButton variant="warning" disabled={busy} onclick={onGrantFsAccess}
            >Grant access</SettingsButton
          >
        {:else if health.status === 'error'}
          <SettingsButton disabled={busy} onclick={onRetry}>Retry</SettingsButton>
        {:else}
          <div class="flex flex-wrap gap-2">
            <SettingsButton disabled={busy} onclick={() => onPick(SyncEndpointType.FS)}
              >Change folder</SettingsButton
            >
            <SettingsButton disabled={busy} onclick={onDisconnect}>Disconnect</SettingsButton>
          </div>
        {/if}
      {/snippet}
      <div class="flex flex-wrap items-center gap-2">
        {#if health.status === 'ok'}
          <SyncBadge variant="success">Connected</SyncBadge>
        {:else if health.status === 'permission-required'}
          <SyncBadge variant="warning">Permission required</SyncBadge>
        {:else if health.status === 'error'}
          <SyncBadge variant="danger">Sync failed</SyncBadge>
        {/if}
        {#if health.status === 'ok'}
          <span class="text-sm text-gray-600">
            {#if activeFs.lastSyncedAt === null}
              Not yet synced
            {:else}
              Synced <SyncLastSyncedTime timestamp={activeFs.lastSyncedAt} />
            {/if}
          </span>
        {/if}
      </div>
      <div class="mt-1 font-mono text-xs text-gray-600">{activeFs.path}</div>
      {#if health.status === 'reauth-required' || health.status === 'permission-required'}
        <SyncAlert variant="warning" summary={health.summary} detail={health.detail} />
      {:else if health.status === 'error'}
        <SyncAlert
          variant="danger"
          summary={health.summary}
          detail={health.detail}
          technicalDetail={health.technicalDetail}
        />
      {/if}
    </SettingsItem>

    <SettingsItem
      label="Change sync location"
      description="Switching destinations stops mirroring to your sync folder; files already there stay on disk. Your library on this device will sync up to the new destination unless you wipe it during the switch."
    >
      {#snippet control()}
        <div class="flex flex-wrap gap-2">
          {#each cloudProviders as option (option.provider)}
            <SettingsButton disabled={busy} onclick={() => onPick(option.provider)}>
              Switch to {providerLabel(option.provider)}
            </SettingsButton>
          {/each}
        </div>
      {/snippet}
    </SettingsItem>
  {/if}
</SettingsSection>
