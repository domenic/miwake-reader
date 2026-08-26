export function dummyFn() {}

/**
 * Mark a promise as deliberately fire-and-forget: log nothing here,
 * trust the called code to have handled its own visibility (e.g. the
 * tracker's hadError UI indicator). The wrapper exists to make the
 * intent explicit at the call site and to keep unhandled-rejection
 * warnings out of the console.
 */
export function fireAndForget(promise: Promise<unknown>): void {
  promise.catch(() => {});
}

export function caluclatePercentage(x: number, y: number) {
  return Math.floor((x / y) * 100);
}

export function filterNotNullAndNotUndefined<T>(
  value: T | null | undefined
): value is NonNullable<T> {
  return value !== null && value !== undefined;
}

export function randomize(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function getWeightedAverage(values: number[], weights: number[]) {
  let sum = 0;
  let weightedSum = 0;

  for (let index = 0, { length } = values; index < length; index += 1) {
    sum += values[index] * weights[index];
    weightedSum += weights[index];
  }

  return sum / weightedSum;
}

export function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function pluralize(value: number, term: string, printValue = true) {
  return `${printValue ? `${value} ` : ''}${term}${value !== 1 ? 's' : ''}`;
}

export function convertRemToPixels(window: Window, rem: number) {
  return rem * parseFloat(window.getComputedStyle(document.documentElement).fontSize);
}
