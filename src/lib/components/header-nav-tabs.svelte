<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { faBookOpen, faChartLine, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import { pagePath } from '$lib/data/env';
  import { database } from '$lib/data/store';
  import { map, share } from 'rxjs';

  interface Props {
    disableNavigation?: boolean;
    onnavigate?: (routeId: string) => void;
  }

  let { disableNavigation = false, onnavigate }: Props = $props();

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
    onnavigate?.(routeId);

    if (!disableNavigation) {
      goto(`${pagePath}${routeId}${query}`);
    }
  }
</script>

{#if $currentBookId$}
  <HeaderButton
    faIcon={faBookOpen}
    label="Book"
    selected={page.route.id === '/b'}
    variant="tab"
    onclick={() => handleClick('/b', `?id=${$currentBookId$}`)}
  />
{/if}
{#each tabs as tab (tab.routeId)}
  <HeaderButton
    faIcon={tab.icon}
    label={tab.label}
    selected={page.route.id === tab.routeId}
    variant="tab"
    onclick={() => handleClick(tab.routeId)}
  />
{/each}
