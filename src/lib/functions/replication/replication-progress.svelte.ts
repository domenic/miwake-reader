import type { Entry } from '@zip.js/zip.js';

export interface ReplicationContext {
  title: string;
  imagePath?: string | Blob | Entry;
}

export interface ReplicationProgress {
  progressToAdd?: number;
  progressBase?: number;
  maxProgress?: number;
  skipStep?: boolean;
  completeStep?: boolean;
}

class ReplicationProgressState {
  progress = $state(0);
  toProgress = $state(0);
  remaining = $state('~ ??:??:??');

  #active = false;
  #executionStart = 0;
  #progressBase = 0;
  #signal: AbortSignal | undefined;

  start(signal?: AbortSignal) {
    this.#active = true;
    this.#signal = signal;
    this.#progressBase = 0;
    this.#executionStart = Date.now();
    this.progress = 0;
    this.toProgress = 1;
    this.remaining = '~ ??:??:??';
  }

  reset() {
    this.#active = false;
    this.#signal = undefined;
    this.#progressBase = 0;
    this.#executionStart = 0;
    this.progress = 0;
    this.toProgress = 0;
    this.remaining = '~ ??:??:??';
  }

  showCanceling() {
    this.remaining = 'Canceling…';
  }

  report(progressUpdate: ReplicationProgress) {
    if (!this.#active || this.#signal?.aborted) return;

    this.#progressBase = progressUpdate.progressBase ?? this.#progressBase;
    this.toProgress = progressUpdate.maxProgress ?? this.toProgress;

    if (progressUpdate.skipStep && this.#progressBase > 0) {
      const diff =
        Math.ceil(this.progress / this.#progressBase) * this.#progressBase - this.progress;
      this.progress =
        Math.floor((this.progress + (diff || this.#progressBase) + Number.EPSILON) * 1000) / 1000;
    } else if (progressUpdate.completeStep) {
      const diff = Math.ceil(this.progress) - this.progress;
      this.progress = Math.floor((this.progress + diff + Number.EPSILON) * 1000) / 1000;
    } else if (progressUpdate.progressToAdd && progressUpdate.progressToAdd > 0) {
      this.progress =
        Math.floor((this.progress + progressUpdate.progressToAdd + Number.EPSILON) * 1000) / 1000;
    }

    if (progressUpdate.progressToAdd) {
      const duration = (Date.now() - this.#executionStart) / 1000;
      const processPerSecond = this.progress / duration;
      const remaining = (this.toProgress - this.progress) / processPerSecond;
      this.remaining =
        this.toProgress > this.progress ? `~ ${getTimestamp(Math.ceil(remaining))}` : '~ 00:00:01';
    }
  }
}

function getTimestamp(seconds: number) {
  return seconds && Number.isFinite(seconds)
    ? new Date(seconds * 1000).toISOString().substr(11, 8)
    : '??:??:??';
}

export const replicationProgressState = new ReplicationProgressState();
