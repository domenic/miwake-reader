import { describe, expect, it } from 'vitest';
import {
  getStatisticsURL,
  getValidStatisticsView,
  statisticsViews
} from '../../src/lib/components/statistics/statistics-view.ts';

describe('statistics views', () => {
  it('recognizes the goals view', () => {
    expect(statisticsViews).toContain('goals');
    expect(getValidStatisticsView('goals')).toBe('goals');
  });

  it('keeps book filters when building a goals URL', () => {
    expect(getStatisticsURL('goals', ['First book', 'Second book'])).toBe(
      '/statistics?view=goals&t=First+book&t=Second+book'
    );
  });
});
