export class AbortError extends Error {
  name = 'AbortError';
}

export function throwIfAborted(cancelSignal?: AbortSignal) {
  if (!cancelSignal) {
    return;
  }

  if (typeof cancelSignal.throwIfAborted === 'function') {
    cancelSignal.throwIfAborted();
  } else if (cancelSignal.aborted) {
    throw new AbortError('User canceled');
  }
}
