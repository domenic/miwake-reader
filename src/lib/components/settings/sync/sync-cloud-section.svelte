<script lang="ts">
  import { appName } from '$lib/data/env';
  import { confirmDialog } from '$lib/data/simple-dialogs';
  import { StorageKey } from '$lib/data/storage/storage-types';
  import {
    cloudConnection$,
    cloudCustomCredentials$,
    cloudHealth$,
    type CloudProviderType
  } from '$lib/data/sync/sync-store';
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

  async function onConnect(provider: CloudProviderType) {
    // Phase 1 stub — fakes a successful connection so UI states are exercisable.
    $cloudConnection$ = {
      provider,
      accountLabel: provider === StorageKey.GDRIVE ? 'domenic@example.com' : 'domenic@outlook.com',
      usesCustomCredentials: false,
      connectedAt: Date.now(),
      lastSyncedAt: Date.now(),
      bookCount: 0
    };
    $cloudHealth$ = { status: 'ok' };
  }

  async function onSignOut() {
    const cancelled = await confirmDialog({
      title: 'Sign out?',
      message:
        'This will disconnect from your cloud account on this device. Your cloud data will not be touched.'
    });
    if (cancelled) return;
    $cloudConnection$ = null;
    $cloudHealth$ = { status: 'ok' };
  }

  async function onSwitch(to: CloudProviderType) {
    if (active) {
      const cancelled = await confirmDialog({
        title: `Switch to ${providerLabel(to)}?`,
        message: `This will sign you out of ${providerLabel(active.provider)} first.`
      });
      if (cancelled) return;
      $cloudConnection$ = null;
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
        $cloudConnection$ = null;
      }
      return;
    }

    if (result.kind === 'revert-to-default') {
      if (active?.provider === provider) {
        $cloudConnection$ = { ...active, usesCustomCredentials: false };
      }
      return;
    }

    // Persist the entered credentials, whether or not we activate them now.
    $cloudCustomCredentials$ = {
      ...$cloudCustomCredentials$,
      [provider]: result.credentials
    };

    if (result.activate) {
      $cloudConnection$ = {
        provider,
        accountLabel: provider === StorageKey.GDRIVE ? 'custom@example.com' : 'custom@outlook.com',
        usesCustomCredentials: true,
        connectedAt: Date.now(),
        lastSyncedAt: Date.now(),
        bookCount: 0
      };
      $cloudHealth$ = { status: 'ok' };
    }
  }

  async function onReconnect() {
    // Phase 1 stub — clears the reauth state.
    $cloudHealth$ = { status: 'ok' };
    if (active) $cloudConnection$ = { ...active, lastSyncedAt: Date.now() };
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
          <SyncButton variant="primary" onclick={() => onConnect(provider)}>Connect</SyncButton>
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
        <div class="mt-1 text-sm text-gray-600">{active.accountLabel}</div>
        <div class="text-sm text-gray-600">
          {#if $cloudHealth$.status === 'ok'}
            Synced {formatRelativeTime(active.lastSyncedAt)} · {active.bookCount} books
          {:else}
            Last successful sync {formatRelativeTime(active.lastSyncedAt)} · {active.bookCount} books
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
