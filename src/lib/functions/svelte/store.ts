import { BehaviorSubject } from 'rxjs';
import { subjectToSvelteWritable } from '../rxjs/subject-to-writable';

export function writableSubject<T>(value: T) {
  return subjectToSvelteWritable(new BehaviorSubject<T>(value));
}
