<script module lang="ts">
  import MessageDialog from '$lib/components/message-dialog.svelte';
  import { showDialog } from '$lib/components/dialog/show-dialog';

  export type MessageDialogContent = { title: string } & (
    | { message: string; messageHTML?: never }
    | { message?: never; messageHTML: string }
  );

  export function showMessageDialog({ title, message, messageHTML }: MessageDialogContent) {
    return showDialog(
      MessageDialog,
      { title, message, messageHTML },
      {
        closedBy: 'closerequest',
        resolveResult: () => undefined
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
  }

  let { title, message, messageHTML }: Props = $props();
</script>

<DialogContentShell {title}>
  {#if messageHTML}
    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
    <p class="whitespace-pre-line">{@html messageHTML}</p>
  {:else}
    <p class="whitespace-pre-line">{message}</p>
  {/if}

  {#snippet actions()}
    <DialogButton value="close">OK</DialogButton>
  {/snippet}
</DialogContentShell>
