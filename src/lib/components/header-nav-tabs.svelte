<script lang="ts">
  import type { RouteId } from '$app/types';
  import { goto } from '$app/navigation';
  import { resolve } from '$app/paths';
  import { page } from '$app/state';
  import { faBookOpen, faChartLine, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
  import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
  import HeaderButton from '$lib/components/header-button.svelte';
  import { database } from '$lib/data/store';

  type HeaderRouteId = Extract<RouteId, '/b' | '/statistics' | '/settings' | '/manage'>;
  type HeaderRouteWithQuery = HeaderRouteId | `${HeaderRouteId}?${string}`;
  type QueryString = `?${string}` | '';

  interface Props {
    disableNavigation?: boolean;
    onnavigate?: (routeId: HeaderRouteId) => void;
  }

  let { disableNavigation = false, onnavigate }: Props = $props();

  const tabs = [
    { routeId: '/statistics', label: 'Statistics', icon: faChartLine },
    { routeId: '/settings', label: 'Settings', icon: faCog },
    { routeId: '/manage', label: 'Manager', icon: faSignOutAlt }
  ] satisfies { routeId: HeaderRouteId; label: string; icon: IconDefinition }[];

  function isSelectedRoute(routeId: HeaderRouteId) {
    return page.route.id === routeId || page.route.id?.startsWith(`${routeId}/`);
  }

  function handleClick(routeId: HeaderRouteId, query: QueryString = '') {
    onnavigate?.(routeId);

    if (!disableNavigation) {
      goto(resolve(getRouteWithQuery(routeId, query)));
    }
  }

  function getRouteWithQuery(routeId: HeaderRouteId, query: QueryString): HeaderRouteWithQuery {
    return query ? `${routeId}${query}` : routeId;
  }
</script>

{#if database.lastItemTitle !== undefined}
  <HeaderButton
    faIcon={faBookOpen}
    label="Book"
    selected={page.route.id === '/b'}
    variant="tab"
    onclick={() => handleClick('/b', `?${new URLSearchParams({ t: database.lastItemTitle! })}`)}
  />
{/if}
{#each tabs as tab (tab.routeId)}
  <HeaderButton
    faIcon={tab.icon}
    label={tab.label}
    selected={isSelectedRoute(tab.routeId)}
    variant="tab"
    onclick={() => handleClick(tab.routeId)}
  />
{/each}
