import { skip } from 'rxjs';
import { localStorage as appLocalStorage } from '../window/local-storage';
import { writableSubject } from '$lib/functions/svelte/store';

type Storage = typeof appLocalStorage;

/**
 * "preference" — the key is part of the user's saved configuration
 * (theme, fonts, sync direction, custom OAuth creds, etc.) and should
 * be included in app-settings backups.
 *
 * "runtime" — the key holds engine-managed state that's reconciled
 * from another source on app boot (e.g. cloudConnection$ rebuilt
 * from IndexedDB by loadConnectionsFromDb). Excluded from backups
 * because restoring stale runtime state is meaningless.
 */
export type StorageSubjectKind = 'preference' | 'runtime';

const preferenceKeys = new Set<string>();

/**
 * Read-only snapshot of every localStorage key that `writableStorageSubject`
 * has registered as a user preference. Backup uses this as the
 * allowlist for the App-settings export so we don't have to maintain
 * a separate list of keys-to-include or keys-to-exclude.
 */
export const localStoragePreferenceKeys: ReadonlySet<string> = preferenceKeys;

export function writableStorageSubject<T>(
  storage: Storage,
  mapFromString: (s: string) => T,
  mapToString: (t: T) => string
) {
  return (key: string, defaultValue: T, kind: StorageSubjectKind = 'preference') => {
    if (kind === 'preference' && storage === appLocalStorage) {
      preferenceKeys.add(key);
    }
    const initValue = getStoredOrDefault(storage)(key, defaultValue, mapFromString);
    const subject = writableSubject(initValue);
    subject.pipe(skip(1)).subscribe((updatedValue) => {
      storage.setItem(key, mapToString(updatedValue ?? defaultValue));
    });
    return subject;
  };
}

function getStoredOrDefault(storage: Storage) {
  return <T>(key: string, defaultVal: T, mapFn: (s: string) => T) => {
    const stored = storage.getItem(key);
    return stored ? mapFn(stored) : defaultVal;
  };
}
