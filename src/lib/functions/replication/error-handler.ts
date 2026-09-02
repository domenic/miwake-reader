import type { LimitFunction } from 'p-limit';
import { logger } from '$lib/data/logger';
import { replicationProgressState } from '$lib/functions/replication/replication-progress.svelte';

export function handleErrorDuringReplication(
  error: any,
  baseError = '',
  limiters?: LimitFunction[],
  currentProgressBase?: number
) {
  const message = error.message ?? String(error);

  if (error.name !== 'AbortError') {
    logger.error(`${baseError}${message}`);
  }

  if (error.name === 'AbortError') {
    if (limiters) {
      for (let index = 0, { length } = limiters; index < length; index += 1) {
        limiters[index].clearQueue();
      }
    }

    throw error;
  }

  if (currentProgressBase !== undefined) {
    replicationProgressState.report({ progressBase: currentProgressBase, skipStep: true });
  } else {
    replicationProgressState.report({ skipStep: true });
  }

  return `${baseError}${message}`;
}
