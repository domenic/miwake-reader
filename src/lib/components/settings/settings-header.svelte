<script lang="ts">
  import { resolve } from '$app/paths';
  import {
    faBookOpenReader,
    faClock,
    faCloudArrowUp,
    faPalette
  } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import { getSettingsURL, type SettingsView } from '$lib/components/settings/settings-view';
  import { baseHeaderClasses } from '$lib/css-classes';

  interface Props {
    activeView?: SettingsView;
  }

  let { activeView }: Props = $props();

  const settingItems = [
    {
      label: 'Appearance',
      view: 'appearance',
      icon: faPalette
    },
    {
      label: 'Reading',
      view: 'reading',
      icon: faBookOpenReader
    },
    {
      label: 'Tracking',
      view: 'tracking',
      icon: faClock
    },
    {
      label: 'Sync',
      view: 'sync',
      icon: faCloudArrowUp
    }
  ] as const;
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
          selected={activeView === settingItem.view}
          variant="tab"
          href={resolve(getSettingsURL(settingItem.view))}
        />
      {/each}
    </div>
    <div class="hidden md:flex">
      <HeaderNavTabs />
    </div>
  </div>
</div>
