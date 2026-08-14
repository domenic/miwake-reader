<script lang="ts">
  import { page } from '$app/state';
  import HeaderButton from '$lib/components/header-button.svelte';
  import { getNavTabs } from '$lib/components/header-nav';
  import { readerChrome } from '$lib/data/reader-chrome.svelte';
  import { replicationProgressState } from '$lib/functions/replication/replication-progress.svelte';

  let hidden = $derived(
    (page.route.id === '/b' && readerChrome.hidden) ||
      (page.route.id === '/manage' && replicationProgressState.toProgress > 0)
  );
</script>

<!--
  `data-mobile-navigation` and the `inert` attribute drive the `mobile-navigation-height`
  custom property in `app.css`, which insets the rest of the app while the bar is shown.
-->
<nav
  data-mobile-navigation
  aria-label="Primary navigation"
  inert={hidden}
  class="elevation-4 writing-horizontal-tb fixed inset-x-0 bottom-0 z-30 flex bg-gray-700 pb-[env(safe-area-inset-bottom)] text-white transition-opacity duration-150 ease-in-out md:hidden"
  class:opacity-0={hidden}
>
  {#each getNavTabs() as tab (tab.label)}
    <div class="flex min-w-0 flex-1">
      <HeaderButton
        faIcon={tab.icon}
        label={tab.label}
        fill
        selected={tab.selected}
        variant="tab"
        href={tab.href}
      />
    </div>
  {/each}
</nav>
