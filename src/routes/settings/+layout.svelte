<script lang="ts">
  import type { RouteId } from '$app/types';
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import type { Snippet } from 'svelte';
  import SettingsHeader from '$lib/components/settings/settings-header.svelte';
  import type { SettingsRoute } from '$lib/components/settings/settings-route';
  import { pxScreen } from '$lib/css-classes';
  import { pagePath } from '$lib/data/env';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  let activeRouteId = $derived(page.route.id as RouteId | null);

  function navigateToSettingsSection(href: SettingsRoute) {
    if (href === page.route.id) {
      return;
    }

    goto(`${pagePath}${href}`, { keepFocus: true, noScroll: true });
  }
</script>

<div class="elevation-4 fixed inset-x-0 top-0 z-10">
  <SettingsHeader {activeRouteId} onselect={navigateToSettingsSection} />
</div>

<div class="{pxScreen} h-full pt-16">
  {@render children?.()}
</div>
