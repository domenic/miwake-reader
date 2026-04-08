import type { BookCardProps } from '$lib/components/book-card/book-card-props';

export enum SortDirection {
  ASC = 'asc',
  DESC = 'desc'
}

export interface SortOption {
  property: Exclude<keyof BookCardProps, 'imagePath' | 'isPlaceholder'>;
  direction: SortDirection;
}
