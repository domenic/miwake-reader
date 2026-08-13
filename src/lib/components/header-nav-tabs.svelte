<script lang="ts">
  import type { RouteId } from '$app/types';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { faBookOpen, faChartLine, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import { getBookStatisticsURL } from '$lib/components/statistics/statistics-view';
  import { database } from '$lib/data/store';
  import { getBookURL } from '$lib/functions/book-url';

  type HeaderRouteId = Extract<RouteId, '/b' | '/statistics' | '/settings' | '/manage'>;

  interface Props {
    currentBookTitle?: string;
  }

  let { currentBookTitle }: Props = $props();

  const tabs = [
    { routeId: '/statistics', label: 'Statistics', icon: faChartLine },
    { routeId: '/settings', label: 'Settings', icon: faCog },
    { routeId: '/manage', label: 'Manager', icon: faSignOutAlt }
  ] satisfies { routeId: HeaderRouteId; label: string; icon: IconDefinition }[];

  function isSelectedRoute(routeId: HeaderRouteId) {
    return page.route.id === routeId || page.route.id?.startsWith(`${routeId}/`);
  }

  function getTabHref(routeId: HeaderRouteId) {
    if (routeId === '/statistics' && page.route.id === '/b' && currentBookTitle) {
      return getBookStatisticsURL(currentBookTitle);
    }

    return routeId;
  }
</script>

{#if database.lastItemTitle !== undefined}
  <HeaderButton
    faIcon={faBookOpen}
    label="Book"
    selected={page.route.id === '/b'}
    variant="tab"
    href={resolve(getBookURL(database.lastItemTitle))}
  />
{/if}
{#each tabs as tab (tab.routeId)}
  <HeaderButton
    faIcon={tab.icon}
    label={tab.label}
    selected={isSelectedRoute(tab.routeId)}
    variant="tab"
    href={resolve(getTabHref(tab.routeId))}
  />
{/each}
