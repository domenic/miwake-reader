<script lang="ts">
  import { ripple } from '$lib/components/ripple';
  import { buttonClasses, dialogActionsClasses, dialogTitleClasses } from '$lib/css-classes';
  import type { SimpleDialogContent } from '$lib/components/simple-dialog-content';

  let { title, message, messageHTML }: SimpleDialogContent = $props();
</script>

<h2 class={dialogTitleClasses}>{title}</h2>
{#if messageHTML}
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  <p class="max-h-[60vh] overflow-auto whitespace-pre-line">{@html messageHTML}</p>
{:else}
  <p class="max-h-[60vh] overflow-auto whitespace-pre-line">{message}</p>
{/if}
<form method="dialog" class={dialogActionsClasses}>
  <button use:ripple class={buttonClasses} value="cancel" type="submit">Cancel</button>
  <button use:ripple class={buttonClasses} value="confirm" type="submit">Confirm</button>
</form>
