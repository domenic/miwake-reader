import type { RouteId } from '$app/types';

export type SettingsView = 'appearance' | 'reading' | 'tracking' | 'sync';

export const defaultSettingsView: SettingsView = 'appearance';
const settingsViews: SettingsView[] = [defaultSettingsView, 'reading', 'tracking', 'sync'];

export function getValidSettingsView(view?: string | null): SettingsView {
  return settingsViews.find((settingsView) => settingsView === view) ?? defaultSettingsView;
}

export function getSettingsURL(view: SettingsView) {
  return `/settings/${view}` as Extract<RouteId, `/settings/${SettingsView}`>;
}

export function getSettingsView(routeId?: RouteId | null): SettingsView | undefined {
  return settingsViews.find((settingsView) => getSettingsURL(settingsView) === routeId);
}
