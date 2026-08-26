export type StatisticsView = 'heatmap' | 'summary' | 'goals';

export const defaultStatisticsView: StatisticsView = 'heatmap';
export const statisticsBookQueryParam = 't';
/**
 * Pre-title URLs filtered by the per-device numeric IDB id (`?b=20`). There
 * is nothing stable to map those to, so the page strips them and shows the
 * unfiltered view.
 */
export const statisticsLegacyBookQueryParam = 'b';
export const statisticsViewQueryParam = 'view';
export const statisticsViews: StatisticsView[] = [defaultStatisticsView, 'summary', 'goals'];

export function getValidStatisticsView(view?: string | null): StatisticsView {
  return statisticsViews.includes(view as StatisticsView)
    ? (view as StatisticsView)
    : defaultStatisticsView;
}

export function getStatisticsURL(view: StatisticsView, bookTitles?: readonly string[]) {
  const searchParams = new URLSearchParams({ [statisticsViewQueryParam]: view });

  if (bookTitles !== undefined) {
    if (bookTitles.length) {
      for (const bookTitle of bookTitles) {
        searchParams.append(statisticsBookQueryParam, bookTitle);
      }
    } else {
      searchParams.append(statisticsBookQueryParam, '');
    }
  }

  return `/statistics?${searchParams.toString()}` as `/statistics?${string}`;
}

export function getBookStatisticsURL(bookTitle: string) {
  const searchParams = new URLSearchParams({ [statisticsBookQueryParam]: bookTitle });

  return `/statistics?${searchParams.toString()}` as `/statistics?${string}`;
}

export function getStatisticsBookTitles(searchParams: URLSearchParams) {
  const values = searchParams.getAll(statisticsBookQueryParam);

  if (!values.length) {
    return undefined;
  }

  // A single empty value is the "nothing selected" sentinel; it (and any
  // other empty strings) must not survive as a filter entry.
  const bookTitles = values.filter((value) => value);

  return [...new Set(bookTitles)].sort((a, b) => a.localeCompare(b, 'ja-JP', { numeric: true }));
}

export function getStatisticsBookFilterKey(bookTitles?: readonly string[]) {
  return bookTitles === undefined ? 'all' : `books:${JSON.stringify(bookTitles)}`;
}
