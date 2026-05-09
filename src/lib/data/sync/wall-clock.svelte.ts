/**
 * Coarse 30s wall-clock tick for relative-time labels ("Synced 2
 * minutes ago"). Read `wallClock.now` from a reactive context (a
 * template, `$derived`, or `$effect`) to subscribe to ticks; reads
 * from plain TS see only a snapshot. The interval runs only in the
 * browser — under SSR there's nothing to tick.
 */
let _now = $state(Date.now());

export const wallClock = {
  get now() {
    return _now;
  }
};

if (typeof window !== 'undefined') {
  setInterval(() => {
    _now = Date.now();
  }, 30_000);
}
