<script lang="ts">
  import { faPen, faTrash } from '@fortawesome/free-solid-svg-icons';
  import type { ToggleOption } from '$lib/components/button-toggle-group/toggle-option';
  import { ripple } from '$lib/components/ripple';
  import { availableThemes } from '$lib/data/theme-option';
  import type { Snippet } from 'svelte';
  import Fa from 'svelte-fa';

  interface Props {
    options: ToggleOption<any>[];
    selectedOptionId: any;
    invertColors?: boolean;
    onedit?: (id: string) => void;
    ondelete?: (id: string) => void;
    children?: Snippet;
  }

  let {
    options,
    selectedOptionId = $bindable(),
    invertColors = false,
    onedit,
    ondelete,
    children
  }: Props = $props();

  function mapToStyleString(style: Record<string, any> | undefined) {
    if (!style) return '';

    return Object.entries(style)
      .map(([key, value]) => `${key}: ${value}`)
      .join(';');
  }
</script>

<div class="-m-1 flex flex-wrap">
  {#each options as option}
    <div class="flex">
      <button
        use:ripple
        title={option.id}
        class="m-1 rounded-md border-2 border-gray-400 p-2 text-black text-lg"
        class:border-4={option.thickBorders && option.id === selectedOptionId}
        class:border-blue-300={option.id === selectedOptionId}
        class:bg-gray-700={option.id === selectedOptionId}
        class:text-white={(option.id === selectedOptionId && !invertColors) ||
          (option.id !== selectedOptionId && invertColors)}
        class:bg-white={(option.id === selectedOptionId && invertColors) ||
          (option.id !== selectedOptionId && !invertColors)}
        style={mapToStyleString(option.style)}
        onclick={() => (selectedOptionId = option.id)}
      >
        {option.text}
      </button>
      {#if option.showIcons && option.id === selectedOptionId && !availableThemes.has(option.id)}
        <div class="flex flex-col justify-around mr-2">
          <button onclick={() => onedit?.(option.id)}>
            <Fa icon={faPen} />
          </button>
          <button onclick={() => ondelete?.(option.id)}>
            <Fa icon={faTrash} />
          </button>
        </div>
      {/if}
    </div>
  {/each}

  {#if children}
    {@render children()}
  {/if}
</div>
