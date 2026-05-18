export type TrackerPauseReason =
  | 'manual'
  | 'menu'
  | 'toc'
  | 'jump'
  | 'custom-reading-point'
  | 'resize'
  | 'completion'
  | 'leaving-reader'
  | 'visibility'
  | 'window-blur'
  | 'dictionary'
  | 'idle'
  | 'skip-threshold';

type TrackerPauseReasons = Record<TrackerPauseReason, boolean>;

const trackerPauseReasons: TrackerPauseReason[] = [
  'manual',
  'menu',
  'toc',
  'jump',
  'custom-reading-point',
  'resize',
  'completion',
  'leaving-reader',
  'visibility',
  'window-blur',
  'dictionary',
  'idle',
  'skip-threshold'
];

function createPauseReasons(): TrackerPauseReasons {
  return {
    manual: true,
    menu: false,
    toc: false,
    jump: false,
    'custom-reading-point': false,
    resize: false,
    completion: false,
    'leaving-reader': false,
    visibility: false,
    'window-blur': false,
    dictionary: false,
    idle: false,
    'skip-threshold': false
  };
}

let available = $state(false);
let menuOpen = $state(false);
let pauseReasons = $state<TrackerPauseReasons>(createPauseReasons());
const paused = $derived.by(() => trackerPauseReasons.some((reason) => pauseReasons[reason]));
const pausedOutsideMenu = $derived.by(() => isPausedExceptFor('menu'));

export const trackerStatus = {
  get available() {
    return available;
  },
  get menuOpen() {
    return menuOpen;
  },
  get pausedOutsideMenu() {
    return pausedOutsideMenu;
  },
  get paused() {
    return paused;
  }
};

export function setTrackerAvailable(value: boolean) {
  available = value;
}

export function openTrackerMenu() {
  pauseReasons.menu = true;
  menuOpen = true;
}

export function closeTrackerMenu() {
  menuOpen = false;
  pauseReasons.menu = false;
}

export function toggleTrackerPauseByUser() {
  if (menuOpen) {
    if (isPausedExceptFor('menu')) {
      clearPauseReasonsExcept('menu');
    } else {
      pauseReasons.manual = true;
    }

    return;
  }

  if (paused) {
    clearPauseReasons();
  } else {
    pauseReasons.manual = true;
  }
}

export function pauseTrackerFor(reason: TrackerPauseReason) {
  pauseReasons[reason] = true;
}

export function resumeTrackerFor(reason: TrackerPauseReason) {
  pauseReasons[reason] = false;
}

export function resetTrackerRuntime() {
  available = false;
  menuOpen = false;
  pauseReasons = createPauseReasons();
}

function isPausedExceptFor(excludedReason: TrackerPauseReason) {
  return trackerPauseReasons.some((reason) => reason !== excludedReason && pauseReasons[reason]);
}

function clearPauseReasons() {
  for (const reason of trackerPauseReasons) {
    pauseReasons[reason] = false;
  }
}

function clearPauseReasonsExcept(excludedReason: TrackerPauseReason) {
  for (const reason of trackerPauseReasons) {
    if (reason !== excludedReason) {
      pauseReasons[reason] = false;
    }
  }
}
