import { writable, type Writable } from 'svelte/store';
import { localStorage as appLocalStorage } from '$lib/data/window/local-storage';

/**
 * Registry of preference stores keyed by their localStorage key. The
 * value is a closure that returns the store's effective serialized
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

function persistentLocalStorageStore<T>(
  key: string,
  defaultValue: T,
  mapFromString: (s: string) => T,
  mapToString: (t: T) => string
) {
  let currentValue = getStoredOrDefault(key, defaultValue, mapFromString);
  const store = writable(currentValue);

  function set(value: T) {
    currentValue = value;
    store.set(value);
    appLocalStorage.setItem(key, mapToString(value ?? defaultValue));
  }

  function update(updater: (value: T) => T) {
    set(updater(currentValue));
  }

  preferenceSerializers.set(key, () => mapToString(currentValue ?? defaultValue));
  subscribeToExternalStorageChanges(key, defaultValue, mapFromString, (value) => {
    currentValue = value;
    store.set(value);
  });

  return {
    subscribe: store.subscribe,
    set,
    update
  };
}

export function stringLocalStorageStore<T extends string>(
  key: string,
  defaultValue: T
): Writable<T> {
  return persistentLocalStorageStore(
    key,
    defaultValue,
    (x) => x as T,
    (x) => x
  );
}

export function numberLocalStorageStore(key: string, defaultValue: number): Writable<number> {
  return persistentLocalStorageStore(
    key,
    defaultValue,
    (x) => +x,
    (x) => `${x}`
  );
}

export function booleanLocalStorageStore(key: string, defaultValue: boolean): Writable<boolean> {
  return persistentLocalStorageStore(
    key,
    defaultValue,
    (x) => !!+x,
    (x) => (x ? '1' : '0')
  );
}

export function objectLocalStorageStore<T>(key: string, defaultValue: T): Writable<T> {
  return jsonLocalStorageStore(key, defaultValue, '{}');
}

export function arrayLocalStorageStore<T>(key: string, defaultValue: T[]): Writable<T[]> {
  return jsonLocalStorageStore(key, defaultValue, '[]');
}

export function setLocalStorageStore<T>(key: string, defaultValue: Set<T>): Writable<Set<T>> {
  return persistentLocalStorageStore(
    key,
    defaultValue,
    (x) => new Set(JSON.parse(x || '[]')) as Set<T>,
    (x) => JSON.stringify([...x])
  );
}

function jsonLocalStorageStore<T>(key: string, defaultValue: T, fallback: string): Writable<T> {
  return persistentLocalStorageStore(
    key,
    defaultValue,
    (x) => JSON.parse(x || fallback) as T,
    (x) => JSON.stringify(x)
  );
}

function getStoredOrDefault<T>(key: string, defaultValue: T, mapFromString: (s: string) => T) {
  const stored = appLocalStorage.getItem(key);
  return stored ? mapFromString(stored) : defaultValue;
}

function subscribeToExternalStorageChanges<T>(
  key: string,
  defaultValue: T,
  mapFromString: (s: string) => T,
  setStoreValue: (value: T) => void
) {
  if (typeof window === 'undefined') return;

  window.addEventListener('storage', (event) => {
    if (event.storageArea !== appLocalStorage || (event.key !== key && event.key !== null)) return;

    setStoreValue(event.newValue === null ? defaultValue : mapFromString(event.newValue));
  });
}
