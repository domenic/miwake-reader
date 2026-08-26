<script module lang="ts">
  import ForceResyncDialog from '$lib/components/settings/sync/force-resync-dialog.svelte';
  import { showDialog } from '$lib/components/dialog/show-dialog';
  import type { SyncLocation } from '$lib/data/sync/sync-store.svelte';

  export type ForceResyncDirection = 'newest' | 'local-wins' | 'remote-wins';

  export type ForceResyncDialogResult =
    | { kind: 'cancel' }
    | { kind: 'confirm'; direction: ForceResyncDirection };

  export function showForceResyncDialog(params: {
    location: SyncLocation | null;
  }): Promise<ForceResyncDialogResult> {
    let chosenDirection: ForceResyncDirection = 'newest';
    return showDialog<ForceResyncDialogResult>(
      ForceResyncDialog,
      {
        location: params.location,
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
  import DialogButton from '$lib/components/dialog/dialog-button.svelte';
  import DialogContentShell from '$lib/components/dialog/dialog-content-shell.svelte';
  import SyncRadioGroup from '$lib/components/settings/sync/sync-radio-group.svelte';
  import { describeSyncLocation } from '$lib/components/settings/sync/sync-utils';

  interface Props {
    location: SyncLocation | null;
    captureDirection: (d: ForceResyncDirection) => void;
  }

  let { location, captureDirection }: Props = $props();

  let direction = $state<ForceResyncDirection>('newest');

  let locationLabel = $derived(describeSyncLocation(location) || 'your sync location');

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
      description: `Push this device's version of every item to ${locationLabel}, ignoring modification times. Edits there that haven't been synced here yet will be lost.`
    },
    {
      id: 'remote-wins' as const,
      label: 'Sync location wins',
      description: `Pull every item from ${locationLabel}, ignoring modification times. Any unsynced local edits will be lost.`
    }
  ]);

  let confirmLabel = $derived(
    direction === 'newest' ? 'Reconcile' : direction === 'local-wins' ? 'Push over' : 'Pull over'
  );

  function updateDirection(nextDirection: ForceResyncDirection) {
    direction = nextDirection;
    captureDirection(nextDirection);
  }
</script>

<DialogContentShell
  title="Force full re-sync"
  description={`Walks every book, bookmark, reading statistic, and reading goal in your library to check for differences between ${locationLabel} and this device.`}
>
  <div class="space-y-2">
    <SyncRadioGroup
      heading="Direction"
      name="force-resync-direction"
      {options}
      selected={direction}
      onchange={updateDirection}
    />
    <p class="text-xs text-gray-600">
      Reading statistics and reading goals also respect the merge-mode settings in Advanced, which
      govern how entries combine at the destination on top of the direction above.
    </p>
  </div>

  {#snippet actions()}
    <DialogButton behavior="close">Cancel</DialogButton>
    <DialogButton behavior="submit" value="confirm">{confirmLabel}</DialogButton>
  {/snippet}
</DialogContentShell>
