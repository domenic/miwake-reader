<script lang="ts">
  import { faBookOpenReader, faClock, faDatabase } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import HeaderNavTabs from '$lib/components/header-nav-tabs.svelte';
  import { baseHeaderClasses, pxScreen } from '$lib/css-classes';

  interface Props {
    activeSettings: string;
  }

  let { activeSettings = $bindable() }: Props = $props();

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
  <div class="{pxScreen} flex h-full justify-between px-0 md:px-5">
    <div class="flex">
      {#each settingItems as settingItem (settingItem.label)}
        <HeaderButton
          faIcon={settingItem.icon}
          label={settingItem.label}
          selected={activeSettings === settingItem.label}
          variant="tab"
          onclick={() => (activeSettings = settingItem.label)}
        />
      {/each}
    </div>
    <div class="flex">
      <HeaderNavTabs />
    </div>
  </div>
</div>
