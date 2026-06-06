<script lang="ts">
  import type { Snippet } from 'svelte';
  import { useDialogController } from '$lib/components/dialog/show-dialog';

  interface Props {
    title: string;
    description?: string;
    onsubmit?: (event: SubmitEvent) => void;
    children: Snippet;
    actions: Snippet;
    secondaryActions?: Snippet;
  }

  let { title, description, onsubmit, children, actions, secondaryActions }: Props = $props();

  const dialogController = useDialogController();
</script>

<form
  method="dialog"
  class="relative m-0 flex max-h-[calc(100dvh-4rem)] w-[560px] max-w-[calc(100dvw-4rem)] flex-col"
  onsubmit={(event) => onsubmit?.(event)}
>
  <header class="shrink-0 border-b border-black/10 pb-4">
    <h2 id={dialogController.titleId} class="text-xl font-medium">{title}</h2>
    {#if description}
      <p class="mt-1 text-sm text-gray-600">{description}</p>
    {/if}
  </header>

  <div class="-mx-1 min-h-0 overflow-auto px-1 py-4 text-sm text-gray-700">
    {@render children()}
  </div>

  <footer class="shrink-0 border-t border-black/10 pt-4">
    <div
      class="flex flex-wrap items-center gap-2"
      class:justify-between={!!secondaryActions}
      class:justify-end={!secondaryActions}
    >
      {#if secondaryActions}
        <div class="flex flex-wrap gap-2">
          {@render secondaryActions()}
        </div>
      {/if}

      <div class="ml-auto flex flex-wrap justify-end gap-2">
        {@render actions()}
      </div>
    </div>
  </footer>
</form>
