import type { Observable } from 'rxjs';

export function getValueSync<T>(obs: Observable<T>): T {
  let value: T;
  let exists = false;
  const subscription = obs.subscribe((x) => {
    exists = true;
    value = x;
  });
  subscription.unsubscribe();
  if (!exists) throw new Error('Observable did not emit a value');
  // @ts-expect-error Rely on `exists` to throw if no value was emitted
  return value;
}
