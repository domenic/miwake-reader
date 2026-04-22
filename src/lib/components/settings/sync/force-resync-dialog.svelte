<script module lang="ts">
  import ForceResyncDialog from '$lib/components/settings/sync/force-resync-dialog.svelte';
  import { showDialog } from '$lib/data/simple-dialogs';
  import type {
    CloudConnectionState as CloudConnectionState_,
    FsConnectionState as FsConnectionState_
  } from '$lib/data/sync/sync-store';

  export type ForceResyncDirection = 'newest' | 'local-wins' | 'remote-wins';

  export type ForceResyncDialogResult =
    | { kind: 'cancel' }
    | { kind: 'confirm'; direction: ForceResyncDirection };

  export function showForceResyncDialog(params: {
    cloud: CloudConnectionState_ | null;
    fs: FsConnectionState_ | null;
  }): Promise<ForceResyncDialogResult> {
    let chosenDirection: ForceResyncDirection = 'newest';
    return showDialog<ForceResyncDialogResult>(
      ForceResyncDialog,
      {
        cloud: params.cloud,
        fs: params.fs,
        captureDirection: (d: ForceResyncDirection) => {
          chosenDirection = d;
        }
      },
      {
        closedBy: 'closerequest',
        resolveResult: (returnValue) =>
          returnValue === 'confirm'
            ? { kind: 'confirm', direction: chosenDirection }
            : { kind: 'cancel' }
      }
    );
  }
</script>

<script lang="ts">
  import SyncButton from '$lib/components/settings/sync/sync-button.svelte';
  import SyncRadioGroup from '$lib/components/settings/sync/sync-radio-group.svelte';
  import { describeSyncLocations } from '$lib/components/settings/sync/sync-utils';
  import type { CloudConnectionState, FsConnectionState } from '$lib/data/sync/sync-store';

  interface Props {
    cloud: CloudConnectionState | null;
    fs: FsConnectionState | null;
    captureDirection: (d: ForceResyncDirection) => void;
  }

  let { cloud, fs, captureDirection }: Props = $props();

  let direction = $state<ForceResyncDirection>('newest');

  let locations = $derived(describeSyncLocations(cloud, fs));
  let locationsOrFallback = $derived(locations.length > 0 ? locations : 'your sync locations');

  let options = $derived([
    {
      id: 'newest' as const,
      label: 'Keep newest',
      description: `For each item, whichever side was modified most recently wins. Same behavior as regular sync, just applied to everything at once. Safe default.`,
      isDefault: true
    },
    {
      id: 'local-wins' as const,
      label: 'This device wins',
      description: `Push this device's version of every item to ${locationsOrFallback}, ignoring modification times. Edits there that haven't been synced here yet will be lost.`
    },
    {
      id: 'remote-wins' as const,
      label: 'Sync location wins',
      description: `Pull every item from ${locationsOrFallback}, ignoring modification times. Any unsynced local edits will be lost.`
    }
  ]);

  let confirmLabel = $derived(
    direction === 'newest' ? 'Reconcile' : direction === 'local-wins' ? 'Push over' : 'Pull over'
  );

  $effect(() => {
    captureDirection(direction);
  });
</script>

<div class="w-120 max-w-full">
  <header class="border-b border-black/10 pb-4">
    <h2 class="text-xl font-medium">Force full re-sync</h2>
    <p class="mt-1 text-sm text-gray-600">
      Walks every book, bookmark, reading statistic, and reading goal in your library to check for
      differences between {locationsOrFallback} and this device.
    </p>
  </header>

  <div class="py-2">
    <SyncRadioGroup
      heading="Direction"
      name="force-resync-direction"
      {options}
      selected={direction}
      onchange={(value) => (direction = value)}
    />
    <p class="mt-2 px-2 text-xs text-gray-600">
      Reading statistics and reading goals also respect the merge-mode settings in Advanced, which
      govern how entries combine at the destination on top of the direction above.
    </p>
  </div>

  <footer class="flex items-center justify-end gap-2 border-t border-black/10 pt-4">
    <form method="dialog" class="m-0 flex gap-2">
      <SyncButton type="submit" value="cancel">Cancel</SyncButton>
      <SyncButton type="submit" value="confirm" variant="primary">{confirmLabel}</SyncButton>
    </form>
  </footer>
</div>
