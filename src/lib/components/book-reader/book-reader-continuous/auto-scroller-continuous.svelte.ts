import type { AutoScroller } from '../types';

export class AutoScrollerContinuous implements AutoScroller {
  enabled = $state(false);

  #accumulatedScroll = 0;
  #animationFrameId: number | undefined;
  #document: Document;
  #getMultiplier: () => number;
  #getVerticalMode: () => boolean;
  #previousTick: number | undefined;
  #window: Window;

  constructor(getMultiplier: () => number, getVerticalMode: () => boolean, document: Document) {
    this.#getMultiplier = getMultiplier;
    this.#getVerticalMode = getVerticalMode;
    this.#document = document;
    this.#window = document.defaultView ?? window;
  }

  toggle() {
    if (this.enabled) {
      this.off();
      return;
    }

    this.enabled = true;
    this.#start();
  }

  off() {
    this.enabled = false;
    this.#stop();
  }

  destroy() {
    this.off();
  }

  #start() {
    if (this.#animationFrameId !== undefined) {
      return;
    }

    this.#previousTick = undefined;
    this.#accumulatedScroll = 0;
    this.#animationFrameId = this.#window.requestAnimationFrame(this.#tick);
  }

  #stop() {
    if (this.#animationFrameId !== undefined) {
      this.#window.cancelAnimationFrame(this.#animationFrameId);
      this.#animationFrameId = undefined;
    }

    this.#previousTick = undefined;
    this.#accumulatedScroll = 0;
  }

  #tick = (currentTick: number) => {
    this.#animationFrameId = undefined;

    if (!this.enabled) {
      return;
    }

    if (this.#previousTick !== undefined) {
      const scrollValue = this.#getScrollValue(this.#previousTick, currentTick);

      if (scrollValue) {
        this.#document.documentElement.scrollBy({
          [this.#getVerticalMode() ? 'left' : 'top']: scrollValue
        });
      }
    }

    this.#previousTick = currentTick;
    this.#animationFrameId = this.#window.requestAnimationFrame(this.#tick);
  };

  #getScrollValue(previousTick: number, currentTick: number) {
    this.#accumulatedScroll += this.#calcNewPosition(previousTick, currentTick);
    const scrollValue = Math.trunc(this.#accumulatedScroll);
    this.#accumulatedScroll -= scrollValue;
    return scrollValue;
  }

  #calcNewPosition(previousTick: number, currentTick: number) {
    let scrollScale = 0.00365956;

    if (this.#getVerticalMode()) {
      scrollScale = -0.00091489;
    }
    return scrollScale * this.#getMultiplier() * (currentTick - previousTick);
  }
}
