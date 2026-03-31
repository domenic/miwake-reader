<script lang="ts">
  import { faBookOpenReader, faClock, faDatabase } from '@fortawesome/free-solid-svg-icons';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import HeaderTab from '$lib/components/header-tab.svelte';
  import { baseHeaderClasses, pxScreen } from '$lib/css-classes';

  export let activeSettings: string;

  const settingItems = [
    {
      label: 'Reader',
      icon: faBookOpenReader
    },
    {
      label: 'Data',
      icon: faDatabase
    },
    {
      label: 'Statistics',
      icon: faClock
    }
  ];
</script>

<div class={baseHeaderClasses}>
  <div class="{pxScreen} flex justify-between px-0 md:px-5">
    <div class="flex xl:h-10">
      {#each settingItems as settingItem (settingItem.label)}
        <HeaderTab
          icon={settingItem.icon}
          label={settingItem.label}
          active={activeSettings === settingItem.label}
          on:click={() => (activeSettings = settingItem.label)}
        />
      {/each}
    </div>
    <div class="flex">
      <HeaderNavTabs />
    </div>
  </div>
</div>
