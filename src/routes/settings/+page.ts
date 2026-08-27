import { resolve } from '$app/paths';
import { getSettingsURL, getValidSettingsView } from '$lib/components/settings/settings-view';
import { lastSettingsView$ } from '$lib/data/store';
import { redirect } from '@sveltejs/kit';
import { get } from 'svelte/store';

export const ssr = false;

export function load(): never {
  const settingsView = getValidSettingsView(get(lastSettingsView$));

  throw redirect(307, resolve(getSettingsURL(settingsView)));
}
