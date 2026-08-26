import { fromStore, type Writable } from 'svelte/store';

interface OptionalNumberOptions {
  activeDefault: number;
  toInputValue?: (storedValue: number) => number;
  fromInputValue?: (inputValue: number) => number;
}

/**
 * Adapts a numeric setting where `0` means inactive and positive values configure the active mode.
 * The store remains authoritative; only the last active input is remembered while the setting is
 * inactive.
 */
export function createOptionalNumberSetting(
  store: Writable<number>,
  {
    activeDefault,
    toInputValue = (value) => value,
    fromInputValue = (value) => value
  }: OptionalNumberOptions
) {
  const storedValue = fromStore(store);
  let inputValue = $state(
    toInputValue(storedValue.current > 0 ? storedValue.current : activeDefault)
  );

  $effect(() => {
    if (storedValue.current > 0 && fromInputValue(inputValue) !== storedValue.current) {
      inputValue = toInputValue(storedValue.current);
    }
  });

  return {
    get enabled() {
      return storedValue.current > 0;
    },

    set enabled(enabled: boolean) {
      if (!enabled) {
        storedValue.current = 0;
        return;
      }

      const candidate = fromInputValue(inputValue);
      storedValue.current = Number.isFinite(candidate) && candidate > 0 ? candidate : activeDefault;
    },

    get inputValue() {
      return inputValue;
    },

    set inputValue(value: number) {
      inputValue = value;
      const candidate = fromInputValue(value);
      if (storedValue.current > 0 && Number.isFinite(candidate) && candidate > 0) {
        storedValue.current = candidate;
      }
    },

    reset(value: number) {
      storedValue.current = value;
      inputValue = toInputValue(value > 0 ? value : activeDefault);
    }
  };
}
