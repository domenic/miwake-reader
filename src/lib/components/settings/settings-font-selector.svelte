<script lang="ts">
  import { faFont } from '@fortawesome/free-solid-svg-icons';
  import Popover from '$lib/components/popover/popover.svelte';
  import { LocalFont } from '$lib/data/fonts';
  import { dummyFn } from '$lib/functions/utils';
  import Fa from 'svelte-fa';

  interface Props {
    availableFonts?: LocalFont[];
    fontValue?: string;
  }

  let { availableFonts = [LocalFont.NOTOSANSJP], fontValue = $bindable('') }: Props = $props();

  let element = $state<Popover>();
</script>

<Popover bind:this={element} placement="bottom">
  {#snippet icon()}
    <div class="mx-2" title="Show available default fonts">
      <Fa icon={faFont} />
    </div>
  {/snippet}
  {#snippet content()}
    <div>
      {#each availableFonts as font (font)}
        <div
          tabindex="0"
          role="button"
          class="px-4 py-2 hover:bg-gray-900"
          onclick={() => {
            fontValue = font;
            element?.toggleOpen();
          }}
          onkeyup={dummyFn}
        >
          {font}
        </div>
      {/each}
    </div>
  {/snippet}
</Popover>
