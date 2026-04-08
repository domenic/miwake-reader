import { filter, map, pipe } from 'rxjs';

export function reduceToEmptyString() {
  return pipe(
    map((): '' => ''),
    filter((_, index) => !index)
  );
}
