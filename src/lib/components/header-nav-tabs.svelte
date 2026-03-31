<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { faBookOpen, faChartLine, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
  import HeaderTab from '$lib/components/header-tab.svelte';
  import { pagePath } from '$lib/data/env';
  import { database } from '$lib/data/store';
  import { createEventDispatcher } from 'svelte';
  import { map, share } from 'rxjs';

  export let disableNavigation = false;

  const dispatch = createEventDispatcher<{ navigate: string }>();

  const currentBookId$ = database.lastItem$.pipe(
    map((item) => item?.dataId),
    share()
  );

  const tabs = [
    { routeId: '/statistics', label: 'Statistics', icon: faChartLine },
    { routeId: '/settings', label: 'Settings', icon: faCog },
    { routeId: '/manage', label: 'Manager', icon: faSignOutAlt }
  ];

  function handleClick(routeId: string, query = '') {
    dispatch('navigate', routeId);

    if (!disableNavigation) {
      goto(`${pagePath}${routeId}${query}`);
    }
  }
</script>

{#if $currentBookId$}
  <HeaderTab
    icon={faBookOpen}
    label="Book"
    active={$page.route.id === '/b'}
    onclick={() => handleClick('/b', `?id=${$currentBookId$}`)}
  />
{/if}
{#each tabs as tab (tab.routeId)}
  <HeaderTab
    icon={tab.icon}
    label={tab.label}
    active={$page.route.id === tab.routeId}
    onclick={() => handleClick(tab.routeId)}
  />
{/each}
