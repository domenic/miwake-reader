import { describe, expect, it } from 'vitest';
import {
  getStatisticsURL,
  getValidStatisticsView
} from '../../src/lib/components/statistics/statistics-view.ts';

describe('statistics views', () => {
  it('recognizes the goals view', () => {
    expect(getValidStatisticsView('goals')).toBe('goals');
  });

  it('keeps book filters when building a goals URL', () => {
    expect(getStatisticsURL('goals', ['First book', 'Second book'])).toBe(
      '/statistics?view=goals&t=First+book&t=Second+book'
    );
  });
});
