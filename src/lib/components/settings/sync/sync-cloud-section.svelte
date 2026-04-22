<script lang="ts">
  import { appName } from '$lib/data/env';
  import { confirmDialog, messageDialog } from '$lib/data/simple-dialogs';
  import { StorageKey } from '$lib/data/storage/storage-types';
  import {
    cloudConnection$,
    cloudCustomCredentials$,
    cloudHealth$,
    type CloudProviderType
  } from '$lib/data/sync/sync-store';
  import { connectCloud, disconnectCloud } from '$lib/data/sync/source-manager';
  import { formatRelativeTime, providerLabel } from '$lib/components/settings/sync/sync-utils';
  import SyncAlert from '$lib/components/settings/sync/sync-alert.svelte';
  import SyncBadge from '$lib/components/settings/sync/sync-badge.svelte';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import SyncRow from '$lib/components/settings/sync/sync-row.svelte';
  import SyncSection from '$lib/components/settings/sync/sync-section.svelte';
  import { showCustomOAuthDialog } from '$lib/components/settings/sync/custom-oauth-dialog.svelte';

  const PROVIDERS: CloudProviderType[] = [StorageKey.GDRIVE, StorageKey.ONEDRIVE];

  let active = $derived($cloudConnection$);
  let activeProvider = $derived(active?.provider ?? null);
  let inactiveProvider = $derived(
    activeProvider === StorageKey.GDRIVE
      ? StorageKey.ONEDRIVE
      : activeProvider === StorageKey.ONEDRIVE
        ? StorageKey.GDRIVE
        : null
  );

  let busy = $state(false);

  async function onConnect(provider: CloudProviderType) {
    if (busy) return;
    busy = true;
    try {
      await connectCloud(provider);
    } catch (err) {
      await messageDialog({
        title: `Couldn't connect to ${providerLabel(provider)}`,
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      busy = false;
    }
  }

  async function onSignOut() {
    const cancelled = await confirmDialog({
      title: 'Sign out?',
      message:
        'This will disconnect from your cloud account on this device. Your cloud data will not be touched.'
    });
    if (cancelled) return;
    busy = true;
    try {
      await disconnectCloud();
    } finally {
      busy = false;
    }
  }

  async function onSwitch(to: CloudProviderType) {
    if (active) {
      const cancelled = await confirmDialog({
        title: `Switch to ${providerLabel(to)}?`,
        message: `This will sign you out of ${providerLabel(active.provider)} first.`
      });
      if (cancelled) return;
      await disconnectCloud();
    }
    await onConnect(to);
  }

  async function onUseCustom(provider: CloudProviderType) {
    const stored = $cloudCustomCredentials$[provider];
    const isActive = active?.provider === provider && active.usesCustomCredentials;
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
      const nextCreds = { ...$cloudCustomCredentials$ };
      delete nextCreds[provider];
      $cloudCustomCredentials$ = nextCreds;
      if (active?.provider === provider && active.usesCustomCredentials) {
        await disconnectCloud();
      }
      return;
    }

    if (result.kind === 'revert-to-default') {
      if (active?.provider === provider) {
        // Switch the active connection back to the miwake-default OAuth client.
        // Disconnect the custom one first, then reconnect with defaults.
        await disconnectCloud();
        await onConnect(provider);
      }
      return;
    }

    // Persist the entered credentials, whether or not we activate them now.
    $cloudCustomCredentials$ = {
      ...$cloudCustomCredentials$,
      [provider]: result.credentials
    };

    if (result.activate) {
      // If already connected (to either mode), disconnect first so
      // connectCloud picks up the new custom credentials on the way back.
      if (active) await disconnectCloud();
      await onConnect(provider);
    }
  }

  async function onReconnect() {
    if (!active) return;
    busy = true;
    try {
      await connectCloud(active.provider);
    } catch (err) {
      await messageDialog({
        title: "Couldn't reconnect",
        message: err instanceof Error ? err.message : String(err)
      });
    } finally {
      busy = false;
    }
  }

  async function onRetry() {
    $cloudHealth$ = { status: 'ok' };
  }
</script>

<SyncSection
  title="Cloud sync"
  description="Connect a cloud account to sync your library, bookmarks, and reading data across devices."
>
  {#if !active}
    {#each PROVIDERS as provider, i (provider)}
      {@const stored = $cloudCustomCredentials$[provider]}
      <SyncRow first={i === 0}>
        {#snippet main()}
          <div class="font-medium">{providerLabel(provider)}</div>
          <div class="mt-1 text-sm text-gray-600">Not connected</div>
          <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
            <span>Using {stored ? 'your stored custom' : `${appName}'s default`} OAuth app.</span>
            <button
              type="button"
              class="cursor-pointer text-gray-600 underline hover:text-black"
              onclick={() => onUseCustom(provider)}
              >{stored ? 'Manage credentials' : 'Use custom credentials'}</button
            >
          </div>
        {/snippet}
        {#snippet actions()}
          <SyncButton variant="primary" disabled={busy} onclick={() => onConnect(provider)}>
            {busy ? 'Connecting' : 'Connect'}
          </SyncButton>
        {/snippet}
      </SyncRow>
    {/each}
  {:else}
    <SyncRow first>
      {#snippet main()}
        <div class="flex flex-wrap items-center gap-2">
          <span class="font-medium">{providerLabel(active.provider)}</span>
          {#if $cloudHealth$.status === 'ok'}
            <SyncBadge variant="success">Connected</SyncBadge>
          {:else if $cloudHealth$.status === 'reauth-required'}
            <SyncBadge variant="warning">Reconnect required</SyncBadge>
          {:else if $cloudHealth$.status === 'error'}
            <SyncBadge variant="danger">Sync failed</SyncBadge>
          {/if}
          {#if active.usesCustomCredentials}
            <SyncBadge variant="info">Custom OAuth</SyncBadge>
          {/if}
        </div>
        <div class="mt-1 text-sm text-gray-600">
          {#if $cloudHealth$.status === 'ok'}
            Synced {formatRelativeTime(active.lastSyncedAt)}
          {:else}
            Last successful sync {formatRelativeTime(active.lastSyncedAt)}
          {/if}
          {#if active.bookCount !== null}
            · {active.bookCount} book{active.bookCount === 1 ? '' : 's'}
          {/if}
        </div>
        {#if $cloudHealth$.status === 'reauth-required' || $cloudHealth$.status === 'permission-required'}
          <SyncAlert
            variant="warning"
            summary={$cloudHealth$.summary}
            detail={$cloudHealth$.detail}
          />
        {:else if $cloudHealth$.status === 'error'}
          <SyncAlert
            variant="danger"
            summary={$cloudHealth$.summary}
            detail={$cloudHealth$.detail}
            technicalDetail={$cloudHealth$.technicalDetail}
          />
        {/if}
        <div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-600">
          <span
            >Using {active.usesCustomCredentials ? 'your' : `${appName}'s default`} OAuth app.</span
          >
          <button
            type="button"
            class="cursor-pointer text-gray-600 underline hover:text-black"
            onclick={() => onUseCustom(active.provider)}
            >{active.usesCustomCredentials
              ? 'Manage credentials'
              : 'Use custom credentials'}</button
          >
        </div>
      {/snippet}
      {#snippet actions()}
        {#if $cloudHealth$.status === 'reauth-required' || $cloudHealth$.status === 'permission-required'}
          <SyncButton variant="warning" onclick={onReconnect}>Reconnect</SyncButton>
        {:else if $cloudHealth$.status === 'error'}
          <SyncButton onclick={onRetry}>Retry</SyncButton>
        {:else}
          <SyncButton onclick={onSignOut}>Sign out</SyncButton>
        {/if}
      {/snippet}
    </SyncRow>
    {#if inactiveProvider}
      <SyncRow>
        {#snippet main()}
          <div class="font-medium text-gray-500">{providerLabel(inactiveProvider)}</div>
          <div class="mt-1 text-xs text-gray-500">
            Switching providers will sign you out of {providerLabel(active.provider)} first.
          </div>
        {/snippet}
        {#snippet actions()}
          <SyncButton onclick={() => onSwitch(inactiveProvider!)}
            >Switch to {providerLabel(inactiveProvider)}</SyncButton
          >
        {/snippet}
      </SyncRow>
    {/if}
  {/if}
</SyncSection>
