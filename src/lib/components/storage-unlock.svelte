<script lang="ts">
  import DialogTemplate from '$lib/components/dialog-template.svelte';
  import Ripple from '$lib/components/ripple.svelte';
  import { buttonClasses } from '$lib/css-classes';
  import { decrypt, type StorageUnlockAction } from '$lib/data/storage/storage-source-manager';
  import { skipKeyDownListener$ } from '$lib/data/store';
  import { onMount, tick } from 'svelte';

  interface Props {
    description: string;
    action: string;
    requiresSecret?: boolean;
    showCancel?: boolean;
    forwardSecret?: boolean;
    encryptedData?: ArrayBuffer;
    resolver: (arg0: StorageUnlockAction | undefined) => void;
    onclose?: () => void;
  }

  let {
    description,
    action,
    requiresSecret = true,
    showCancel = false,
    forwardSecret = false,
    encryptedData,
    resolver,
    onclose
  }: Props = $props();

  let passwordElm = $state<HTMLInputElement>();
  let secret = $state('');
  let error = $state('');
  let showErrorAnimation = $state(false);

  async function unlock() {
    showErrorAnimation = false;
    error = '';

    try {
      if (encryptedData) {
        closeDialog({
          ...JSON.parse(new TextDecoder().decode(await decrypt(window, encryptedData, secret))),
          ...(forwardSecret ? { secret } : {})
        });
      } else if (requiresSecret) {
        throw new Error('No data to unlock found');
      }

      showErrorAnimation = false;
      closeDialog({ clientId: '', clientSecret: '' });
    } catch (err: any) {
      error = `Failed to unlock Data${err.message ? `: ${err.message}` : ''}`;
      await tick();
      showErrorAnimation = true;
    }
  }

  function closeDialog(data?: StorageUnlockAction) {
    resolver(data);
    onclose?.();
  }

  onMount(() => {
    skipKeyDownListener$.next(true);

    if (passwordElm) {
      passwordElm.focus();
    }

    return () => skipKeyDownListener$.next(false);
  });
</script>

<DialogTemplate>
  {#snippet content()}
    <div class="flex flex-col text-sm sm:text-base" class:error-animation={showErrorAnimation}>
      <div>{description}</div>
      <div class="my-2">{action}</div>
      {#if requiresSecret}
        <input
          type="password"
          placeholder="Password"
          bind:value={secret}
          bind:this={passwordElm}
          onkeyup={(evt) => {
            if (evt.key === 'Enter') {
              unlock();
            }
          }}
        />
      {/if}
      <div class="text-red-500">{error}</div>
    </div>
  {/snippet}
  {#snippet footer()}
    <div class="mt-2 flex grow justify-between">
      {#if requiresSecret || showCancel}
        <button
          class={buttonClasses}
          onclick={() => {
            closeDialog();
          }}
        >
          Cancel
          <Ripple />
        </button>
      {/if}
      <button class={buttonClasses} onclick={unlock}>
        Confirm
        <Ripple />
      </button>
    </div>
  {/snippet}
</DialogTemplate>

<style>
  .error-animation {
    animation: shake 0.5s;
  }

  @keyframes shake {
    0% {
      transform: translate(1px, 1px) rotate(0deg);
    }
    10% {
      transform: translate(-1px, -2px) rotate(-1deg);
    }
    20% {
      transform: translate(-3px, 0px) rotate(1deg);
    }
    30% {
      transform: translate(3px, 2px) rotate(0deg);
    }
    40% {
      transform: translate(1px, -1px) rotate(1deg);
    }
    50% {
      transform: translate(-1px, 2px) rotate(-1deg);
    }
    60% {
      transform: translate(-3px, 1px) rotate(0deg);
    }
    70% {
      transform: translate(3px, 1px) rotate(-1deg);
    }
    80% {
      transform: translate(-1px, -1px) rotate(1deg);
    }
    90% {
      transform: translate(1px, 2px) rotate(0deg);
    }
    100% {
      transform: translate(1px, -2px) rotate(-1deg);
    }
  }
</style>
