export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc'
}

/** The /manage library's persisted sort selection. */
export interface SortOption {
  property:
    | 'addedOrder'
    | 'title'
    | 'characters'
    | 'lastBookModified'
    | 'lastBookOpen'
    | 'progress'
    | 'lastBookmarkModified';
  direction: SortDirection;
}

export type Comparator<T> = (first: T, second: T) => number;

export function byNumber<T>(getValue: (value: T) => number): Comparator<T> {
  return (first, second) => getValue(first) - getValue(second);
}
