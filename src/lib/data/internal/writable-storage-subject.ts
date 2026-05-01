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

/**
 * Registry of preference stores keyed by their localStorage key. The
 * value is a closure that returns the store's *effective* serialized
 * value (defaults included), letting backup capture settings the
 * user has merely accepted as well as ones they've explicitly
 * changed. Without this, a freshly-installed user who's never opened
 * any settings page would export an empty preferences blob.
 */
const preferenceSerializers = new Map<string, () => string>();

/**
 * Read-only view of the registry, used by the App-settings backup.
 */
export const localStoragePreferences = {
  has: (key: string) => preferenceSerializers.has(key),
  keys: () => preferenceSerializers.keys(),
  serialize: (key: string) => preferenceSerializers.get(key)?.()
};

export function writableStorageSubject<T>(
  storage: Storage,
  mapFromString: (s: string) => T,
  mapToString: (t: T) => string
) {
  return (key: string, defaultValue: T, kind: StorageSubjectKind = 'preference') => {
    const initValue = getStoredOrDefault(storage)(key, defaultValue, mapFromString);
    const subject = writableSubject(initValue);
    subject.pipe(skip(1)).subscribe((updatedValue) => {
      storage.setItem(key, mapToString(updatedValue ?? defaultValue));
    });
    if (kind === 'preference' && storage === appLocalStorage) {
      preferenceSerializers.set(key, () => mapToString(subject.getValue() ?? defaultValue));
    }
    return subject;
  };
}

function getStoredOrDefault(storage: Storage) {
  return <T>(key: string, defaultVal: T, mapFn: (s: string) => T) => {
    const stored = storage.getItem(key);
    return stored ? mapFn(stored) : defaultVal;
  };
}
