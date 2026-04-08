import type { BooksDbBookData } from '$lib/data/database/books-db/versions/books-db';

export interface LoadData extends Omit<BooksDbBookData, 'id'> {
  coverImage: Blob | undefined;
}
