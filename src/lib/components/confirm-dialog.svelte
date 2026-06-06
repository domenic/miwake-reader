<script module lang="ts">
  import ConfirmDialog from '$lib/components/confirm-dialog.svelte';
  import { showDialog } from '$lib/components/dialog/show-dialog';

  type ConfirmDialogContent = {
    title: string;
    cancelLabel?: string;
    confirmLabel?: string;
    danger?: boolean;
  } & ({ message: string; messageHTML?: never } | { message?: never; messageHTML: string });

  export function showConfirmDialog({
    title,
    message,
    messageHTML,
    cancelLabel = 'Cancel',
    confirmLabel = 'Confirm',
    danger = false
  }: ConfirmDialogContent) {
    return showDialog<boolean>(
      ConfirmDialog,
      { title, message, messageHTML, cancelLabel, confirmLabel, danger },
      {
        closedBy: 'any',
        resolveResult: (returnValue) => returnValue === 'confirm'
      }
    );
  }
</script>

<script lang="ts">
  import DialogButton from '$lib/components/dialog/dialog-button.svelte';
  import DialogContentShell from '$lib/components/dialog/dialog-content-shell.svelte';

  interface Props {
    title: string;
    message?: string;
    messageHTML?: string;
    cancelLabel?: string;
    confirmLabel?: string;
    danger?: boolean;
  }

  let {
    title,
    message,
    messageHTML,
    cancelLabel = 'Cancel',
    confirmLabel = 'Confirm',
    danger = false
  }: Props = $props();
</script>

<DialogContentShell {title}>
  {#if messageHTML}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p class="whitespace-pre-line">{@html messageHTML}</p>
  {:else}
    <p class="whitespace-pre-line">{message}</p>
  {/if}

  {#snippet actions()}
    <DialogButton value="cancel">{cancelLabel}</DialogButton>
    <DialogButton value="confirm" {danger}>{confirmLabel}</DialogButton>
  {/snippet}
</DialogContentShell>
