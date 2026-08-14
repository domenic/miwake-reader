import { booleanLocalStorageStore } from '$lib/data/internal/persistent-local-storage-store';

export const simplifyBookTitles$ = booleanLocalStorageStore('simplifyBookTitles', true);
