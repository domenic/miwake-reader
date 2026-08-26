import { browser } from '$app/environment';
import { resolve } from '$app/paths';
import { page } from '$app/state';
import type { ResolvedPathname, RouteId } from '$app/types';
import type { IconDefinition } from '@fortawesome/free-solid-svg-icons';
import { faBookOpen, faChartLine, faCog, faSignOutAlt } from '@fortawesome/free-solid-svg-icons';
import { getBookStatisticsURL } from '$lib/components/statistics/statistics-view';
import { database } from '$lib/data/store';
import { getBookURL } from '$lib/functions/book-url';

type HeaderRouteId = Extract<RouteId, '/b' | '/statistics' | '/settings' | '/manage'>;

export interface NavTab {
  label: string;
  icon: IconDefinition;
  href: ResolvedPathname;
  selected: boolean;
}

const tabs = [
  { routeId: '/statistics', label: 'Statistics', icon: faChartLine },
  { routeId: '/settings', label: 'Settings', icon: faCog },
  { routeId: '/manage', label: 'Manager', icon: faSignOutAlt }
] satisfies { routeId: HeaderRouteId; label: string; icon: IconDefinition }[];

/**
 * On the reader route the canonical book title lives in the `t` query parameter (see
 * `getBookURL`), so navigation can deep-link to the current book without the reader threading
 * its title through every header component. Guarded by `browser` because search params are
 * unavailable while prerendering; hydration fills in the book-specific link.
 */
function currentBookTitle() {
  if (!browser || page.route.id !== '/b') {
    return undefined;
  }

  return page.url.searchParams.get('t') ?? undefined;
}

function isSelectedRoute(routeId: HeaderRouteId) {
  return page.route.id === routeId || !!page.route.id?.startsWith(`${routeId}/`);
}

function getTabHref(routeId: HeaderRouteId) {
  if (routeId === '/settings') {
    return '/settings/appearance';
  }

  const bookTitle = currentBookTitle();

  if (routeId === '/statistics' && bookTitle !== undefined) {
    return getBookStatisticsURL(bookTitle);
  }

  return routeId;
}

/**
 * The primary navigation targets, shared by the inline tabs in wide-viewport headers
 * (`HeaderNavTabs`) and the bottom navigation bar on narrow viewports (`MobileNavigation`).
 * Reads reactive state (`page`, `database`), so call it from a template or other tracked context.
 */
export function getNavTabs(): NavTab[] {
  return [
    ...(database.lastItemTitle !== undefined
      ? [
          {
            label: 'Book',
            icon: faBookOpen,
            href: resolve(getBookURL(database.lastItemTitle)),
            selected: page.route.id === '/b'
          }
        ]
      : []),
    ...tabs.map(({ routeId, label, icon }) => ({
      label,
      icon,
      href: resolve(getTabHref(routeId)),
      selected: isSelectedRoute(routeId)
    }))
  ];
}
