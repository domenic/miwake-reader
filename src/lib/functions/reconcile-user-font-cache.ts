import { userFontsCacheName } from '$lib/data/fonts';
import { logger } from '$lib/data/logger';
import { userFonts$ } from '$lib/data/store';

/**
 * Reconciles the userFonts$ store (localStorage) with the actual Cache API contents.
 * Removes store entries whose font files are missing from the cache, and deletes
 * orphaned cache entries that aren't referenced by the store.
 */
export async function reconcileUserFontCache() {
  try {
    if (!('caches' in window)) return;

    const cache = await caches.open(userFontsCacheName);
    const cachedPaths = (await cache.keys()).map((r) => new URL(r.url).pathname);
    const userFonts = userFonts$.getValue();

    const validFonts = userFonts.filter((uf) => cachedPaths.includes(uf.path));
    if (validFonts.length !== userFonts.length) {
      userFonts$.next(validFonts);
    }

    for (const path of cachedPaths) {
      if (!validFonts.some((uf) => uf.path === path)) {
        cache.delete(path).catch(() => {});
      }
    }
  } catch (error: any) {
    logger.error(`Error reconciling font cache: ${error.message}`);
  }
}
