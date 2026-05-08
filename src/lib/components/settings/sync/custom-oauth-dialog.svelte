<script module lang="ts">
  import CustomOAuthDialog from '$lib/components/settings/sync/custom-oauth-dialog.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
  import type { CloudProviderType, CustomOAuthCredentials } from '$lib/data/sync/sync-store';

  export type CustomOAuthDialogResult =
    | { kind: 'cancel' }
    | { kind: 'save'; activate: boolean; credentials: CustomOAuthCredentials }
    | { kind: 'clear' }
    | { kind: 'revert-to-default' };

  export function showCustomOAuthDialog(params: {
    provider: CloudProviderType;
    providerLabel: string;
    isActive: boolean;
    hasStoredCredentials: boolean;
    initialClientId?: string;
    initialClientSecret?: string;
    initialTokenEndpoint?: string;
  }): Promise<CustomOAuthDialogResult> {
    let captured: CustomOAuthCredentials = {
      clientId: params.initialClientId ?? '',
      clientSecret: params.initialClientSecret ?? '',
      tokenEndpoint: params.initialTokenEndpoint ?? undefined
    };
    return showDialog<CustomOAuthDialogResult>(
      CustomOAuthDialog,
      {
        provider: params.provider,
        providerLabel: params.providerLabel,
        isActive: params.isActive,
        hasStoredCredentials: params.hasStoredCredentials,
        initialClientId: params.initialClientId ?? '',
        initialClientSecret: params.initialClientSecret ?? '',
        initialTokenEndpoint: params.initialTokenEndpoint ?? '',
        captureCredentials: (c: CustomOAuthCredentials) => {
          captured = c;
        }
      },
      {
        closedBy: 'closerequest',
        resolveResult: (returnValue) => {
          if (returnValue === 'save')
            return { kind: 'save', activate: true, credentials: captured };
          if (returnValue === 'save-no-activate')
            return { kind: 'save', activate: false, credentials: captured };
          if (returnValue === 'clear') return { kind: 'clear' };
          if (returnValue === 'revert-to-default') return { kind: 'revert-to-default' };
          return { kind: 'cancel' };
        }
      }
    );
  }
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import Fa from 'svelte-fa';
  import { faCircleCheck } from '@fortawesome/free-solid-svg-icons';
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import { appName } from '$lib/data/env';
  import { SyncEndpointType } from '$lib/data/storage/storage-types';

  interface Props {
    provider: CloudProviderType;
    providerLabel: string;
    isActive: boolean;
    hasStoredCredentials: boolean;
    initialClientId: string;
    initialClientSecret: string;
    initialTokenEndpoint: string;
    captureCredentials: (c: CustomOAuthCredentials) => void;
  }

  let {
    provider,
    providerLabel,
    isActive,
    hasStoredCredentials,
    initialClientId,
    initialClientSecret,
    initialTokenEndpoint,
    captureCredentials
  }: Props = $props();

  let clientId = $state(untrack(() => initialClientId));
  let clientSecret = $state(untrack(() => initialClientSecret));
  let tokenEndpoint = $state(untrack(() => initialTokenEndpoint));

  const isOneDrive = untrack(() => provider === SyncEndpointType.ONEDRIVE);

  let canSave = $derived(clientId.trim().length > 0 && clientSecret.trim().length > 0);

  $effect(() => {
    captureCredentials({
      clientId: clientId.trim(),
      clientSecret: clientSecret.trim(),
      tokenEndpoint: tokenEndpoint.trim() || undefined
    });
  });
</script>

<div class="w-120 max-w-full">
  <header class="border-b border-black/10 pb-4">
    <h2 class="text-xl font-medium">Custom OAuth credentials</h2>
    <p class="mt-1 text-sm text-gray-600">{providerLabel}</p>
  </header>

  <div class="py-4">
    {#if isActive}
      <div
        class="mb-4 flex items-center justify-between gap-3 rounded-md bg-green-50 px-3 py-2 text-sm text-green-800"
      >
        <span class="flex items-center gap-2 font-medium">
          <Fa icon={faCircleCheck} />
          Currently signed in with these credentials
        </span>
        <form method="dialog" class="m-0">
          <SyncButton type="submit" value="revert-to-default">Revert to default</SyncButton>
        </form>
      </div>
    {:else}
      <p class="mb-3 text-sm text-gray-700">
        By default, {appName} uses its own OAuth client to connect to {providerLabel}. If you'd
        prefer to use your own OAuth application — for example, if your organization restricts
        third-party apps — enter its credentials here.
      </p>
      <p class="mb-4 text-sm text-gray-700">
        Creating your own OAuth application is an advanced workflow. Most users should leave this
        blank.
      </p>
    {/if}

    <form id="custom-oauth-form" method="dialog" class="space-y-3">
      <div>
        <label for="custom-oauth-client-id" class="block text-sm font-medium text-gray-700"
          >Client ID</label
        >
        <input
          id="custom-oauth-client-id"
          type="text"
          class="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 font-mono text-xs focus:border-black focus:outline-none"
          bind:value={clientId}
          placeholder={isOneDrive
            ? '00000000-0000-0000-0000-000000000000'
            : '123456789-abc...apps.googleusercontent.com'}
          required
        />
      </div>
      <div>
        <label for="custom-oauth-client-secret" class="block text-sm font-medium text-gray-700"
          >Client secret</label
        >
        <input
          id="custom-oauth-client-secret"
          type="password"
          class="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 font-mono text-xs focus:border-black focus:outline-none"
          bind:value={clientSecret}
          required
        />
      </div>
      {#if isOneDrive}
        <div>
          <label for="custom-oauth-token-endpoint" class="block text-sm font-medium text-gray-700"
            >Token endpoint</label
          >
          <input
            id="custom-oauth-token-endpoint"
            type="text"
            class="mt-1 w-full rounded-md border border-black/15 px-2 py-1.5 font-mono text-xs focus:border-black focus:outline-none"
            bind:value={tokenEndpoint}
            placeholder="https://login.microsoftonline.com/common/oauth2/v2.0/token"
          />
        </div>
      {/if}
    </form>
  </div>

  <footer class="flex items-center justify-between gap-2 border-t border-black/10 pt-4">
    <form method="dialog" class="m-0">
      {#if hasStoredCredentials}
        <SyncButton type="submit" value="clear" variant="danger"
          >Clear stored credentials</SyncButton
        >
      {/if}
    </form>
    <form method="dialog" class="m-0 flex gap-2">
      <SyncButton type="submit" value="cancel">Cancel</SyncButton>
      {#if isActive}
        <SyncButton
          type="submit"
          value="save-no-activate"
          variant="primary"
          disabled={!canSave}
          onclick={(e) => {
            const form = document.getElementById('custom-oauth-form') as HTMLFormElement | null;
            if (form && !form.reportValidity()) {
              e.preventDefault();
            }
          }}>Save changes</SyncButton
        >
      {:else}
        <SyncButton
          type="submit"
          value="save"
          variant="primary"
          disabled={!canSave}
          onclick={(e) => {
            const form = document.getElementById('custom-oauth-form') as HTMLFormElement | null;
            if (form && !form.reportValidity()) {
              e.preventDefault();
            }
          }}>Save and connect</SyncButton
        >
      {/if}
    </form>
  </footer>
</div>
