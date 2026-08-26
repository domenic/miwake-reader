/**
 * Coarse 30s wall-clock tick for time-dependent UI. Read `wallClock.now`
 * from a reactive context (a template, `$derived`, or `$effect`) to
 * subscribe to ticks; reads from plain TS see only a snapshot. The clock
 * also refreshes immediately when a hidden document becomes visible.
 * Browser timers can be suspended while the device sleeps, so the
 * visibility refresh keeps resumed UI from showing stale time periods.
 */
let _now = $state(Date.now());

export const wallClock = {
  get now() {
    return _now;
  }
};

if (typeof window !== 'undefined') {
  const updateNow = () => {
    _now = Date.now();
  };

  setInterval(updateNow, 30_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      updateNow();
    }
  });
}
