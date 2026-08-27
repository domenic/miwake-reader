import { resolve } from '$app/paths';
import {
  getStatisticsBookTitles,
  getStatisticsURL,
  getValidStatisticsView,
  statisticsLegacyBookQueryParam,
  statisticsViewQueryParam
} from '$lib/components/statistics/statistics-view';
import { lastStatisticsView$ } from '$lib/data/store';
import { redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';
import type { PageLoad } from './$types';

export const ssr = false;

export const load: PageLoad = ({ url }) => {
  const requestedView = url.searchParams.get(statisticsViewQueryParam);
  const activeView = getValidStatisticsView(requestedView ?? get(lastStatisticsView$));
  const hasLegacyBookIds = url.searchParams.has(statisticsLegacyBookQueryParam);

  if (hasLegacyBookIds || requestedView !== activeView) {
    const bookTitles = hasLegacyBookIds ? undefined : getStatisticsBookTitles(url.searchParams);

    throw redirect(307, resolve(getStatisticsURL(activeView, bookTitles)));
  }

  return {};
};
