import type BooksDbV7 from '$lib/data/database/books-db/versions/v7/books-db-v7';

type BooksDb = BooksDbV7;
export type { BooksDb };

export type BooksDbBookData = BooksDb['data']['value'];
export type BooksDbBookmarkData = BooksDb['bookmark']['value'];
export type BooksDbStorageSource = BooksDb['storageSource']['value'];
export type BooksDbStatistic = BooksDb['statistic']['value'];
export type BooksDbReadingGoal = BooksDb['readingGoal']['value'];
export type BooksDbLastModified = BooksDb['lastModified']['value'];
export const currentDbVersion = 7;
