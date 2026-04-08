export function cloneMutateSet<T>(set: ReadonlySet<T>, action: (set: Set<T>) => void) {
  const result = new Set(set);
  action(result);
  return result;
}
