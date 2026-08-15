<script lang="ts">
  import HeaderButton from '$lib/components/header-button.svelte';
  import { getNavTabs } from '$lib/components/header-nav';
</script>

{#each getNavTabs() as tab (tab.label)}
  <HeaderButton
    faIcon={tab.icon}
    label={tab.label}
    selected={tab.selected}
    variant="tab"
    href={tab.href}
  />
{/each}
