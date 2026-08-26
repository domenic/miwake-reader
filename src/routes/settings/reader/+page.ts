import { resolve } from '$app/paths';
import { redirect } from '@sveltejs/kit';

export function load(): never {
  throw redirect(307, resolve('/settings/appearance'));
}
