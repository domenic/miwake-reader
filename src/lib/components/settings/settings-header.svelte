<script lang="ts">
  import { resolve } from '$app/paths';
  import type { RouteId } from '$app/types';
  import { faBookOpenReader, faClock, faCloudArrowUp } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import type { SettingsRoute } from '$lib/components/settings/settings-route';
  import { baseHeaderClasses } from '$lib/css-classes';

  interface Props {
    activeRouteId?: RouteId | null;
  }

  interface SettingItem {
    label: string;
    href: SettingsRoute;
    icon: typeof faBookOpenReader;
  }

  let { activeRouteId }: Props = $props();

  const settingItems: SettingItem[] = [
    {
      label: 'Reader',
      href: '/settings/reader',
      icon: faBookOpenReader
    },
    {
      label: 'Sync',
      href: '/settings/sync',
      icon: faCloudArrowUp
    },
    {
      label: 'Statistics',
      href: '/settings/statistics',
      icon: faClock
    }
  ];
</script>

<div class={baseHeaderClasses} role="toolbar" aria-label="Settings controls">
  <div class="flex h-full justify-between">
    <div
      data-mobile-actions
      class="grid w-full grid-flow-col auto-cols-fr md:flex md:w-auto"
      data-sveltekit-keepfocus
      data-sveltekit-noscroll
    >
      {#each settingItems as settingItem (settingItem.label)}
        <HeaderButton
          faIcon={settingItem.icon}
          label={settingItem.label}
          selected={activeRouteId === settingItem.href}
          variant="tab"
          href={resolve(settingItem.href)}
        />
      {/each}
    </div>
    <div class="hidden md:flex">
      <HeaderNavTabs />
    </div>
  </div>
</div>
