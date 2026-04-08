import { browser } from '$app/environment';

const fakeStorage = {
  persist: async () => false,
  persisted: async () => false,
  estimate: async () => ({ quota: 1, usage: 1 })
};

export const storage = browser ? navigator.storage || fakeStorage : fakeStorage;
