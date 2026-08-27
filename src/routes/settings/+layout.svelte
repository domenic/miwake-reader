<script lang="ts">
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import ReaderModeSettings from '$lib/components/settings/reader-mode-settings.svelte';
  import SettingsHeader from '$lib/components/settings/settings-header.svelte';
  import { getSettingsView } from '$lib/components/settings/settings-view';
  import { pxScreen } from '$lib/css-classes';
  import { lastSettingsView$ } from '$lib/data/store';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  let activeView = $derived(getSettingsView(page.route.id));
  let showReaderModeSettings = $derived(activeView === 'appearance' || activeView === 'reading');

  afterNavigate(() => {
    if (activeView !== undefined) {
      $lastSettingsView$ = activeView;
    }
  });
</script>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <SettingsHeader {activeView} />
</div>

<div class="{pxScreen} h-full pt-(--header-height)">
  <main
    class={[
      'mx-auto grid w-full max-w-5xl grid-cols-[minmax(0,1fr)] gap-8 pb-8',
      showReaderModeSettings ? 'pt-0' : 'pt-8'
    ]}
  >
    {#if showReaderModeSettings}
      <ReaderModeSettings />
    {/if}
    {@render children?.()}
  </main>
</div>
