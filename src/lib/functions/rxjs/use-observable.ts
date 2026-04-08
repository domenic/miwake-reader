import type { Observable } from 'rxjs';

export function observe<T>(node: Node, obs: Observable<T>) {
  const subscription = obs.subscribe();

  return {
    destroy: () => subscription.unsubscribe()
  };
}
