export type StatisticsView = 'heatmap' | 'summary';

export const defaultStatisticsView: StatisticsView = 'heatmap';
export const statisticsBookQueryParam = 'b';
export const statisticsViewQueryParam = 'view';
export const statisticsViews: StatisticsView[] = [defaultStatisticsView, 'summary'];

export function getValidStatisticsView(view?: string | null): StatisticsView {
  return statisticsViews.includes(view as StatisticsView)
    ? (view as StatisticsView)
    : defaultStatisticsView;
}

export function getStatisticsURL(view: StatisticsView, bookIds?: readonly number[]) {
  const searchParams = new URLSearchParams({ [statisticsViewQueryParam]: view });

  if (bookIds !== undefined) {
    if (bookIds.length) {
      for (const bookId of bookIds) {
        searchParams.append(statisticsBookQueryParam, bookId.toString());
      }
    } else {
      searchParams.append(statisticsBookQueryParam, '');
    }
  }

  return `/statistics?${searchParams.toString()}` as `/statistics?${string}`;
}

export function getBookStatisticsURL(bookId: number) {
  const searchParams = new URLSearchParams({ [statisticsBookQueryParam]: bookId.toString() });

  return `/statistics?${searchParams.toString()}` as `/statistics?${string}`;
}

export function getStatisticsBookIds(searchParams: URLSearchParams) {
  const values = searchParams.getAll(statisticsBookQueryParam);

  if (!values.length) {
    return undefined;
  }

  const bookIds = values
    .map((value) => Number(value))
    .filter((bookId) => Number.isInteger(bookId) && bookId > 0);

  return [...new Set(bookIds)].sort((a, b) => a - b);
}

export function getStatisticsBookFilterKey(bookIds?: readonly number[]) {
  return bookIds === undefined ? 'all' : `books:${bookIds.join(',')}`;
}
