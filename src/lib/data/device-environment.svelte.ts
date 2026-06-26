import { browser } from '$app/environment';
import { MediaQuery } from 'svelte/reactivity';

class DeviceEnvironment {
  #coarsePointer = new MediaQuery('(pointer: coarse)');

  get isMobile() {
    if (!browser) return false;

    return isMobile(window, this.#coarsePointer.current);
  }
}

function isMobile(windowObject: Window, hasCoarsePointer: boolean) {
  const UA = windowObject.navigator.userAgent;
  const navigator = windowObject.navigator as Navigator & { msMaxTouchPoints?: number };
  const userAgentRegex = /\b(BlackBerry|webOS|iPhone|IEMobile|Android|Windows Phone|iPad|iPod)\b/i;

  if (navigator.maxTouchPoints > 0) {
    return true;
  }

  if (navigator.msMaxTouchPoints !== undefined) {
    return navigator.msMaxTouchPoints > 0;
  }

  if (hasCoarsePointer) {
    return true;
  }

  if ('orientation' in windowObject) {
    return true;
  }

  return userAgentRegex.test(UA);
}

export const deviceEnvironment = new DeviceEnvironment();
