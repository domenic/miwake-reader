import { StorageKey } from '$lib/data/storage/storage-types';
import { writableStringLocalStorageSubject } from '$lib/data/internal/writable-string-local-storage-subject';

/**
 * Survives mostly because the unified /manage view pins it to BROWSER
 * on mount and a few non-sync paths still read it. The per-source
 * dropdown that used to set it is gone.
 */
export const storageSource$ = writableStringLocalStorageSubject<StorageKey>()(
  'lastStorageSource',
  StorageKey.BROWSER
);
