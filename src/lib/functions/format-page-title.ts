import { appName } from '$lib/data/env';

export function formatPageTitle(title: string) {
  if (!title) return appName;
  return `${title} | ${appName}`;
}
