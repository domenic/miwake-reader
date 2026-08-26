import { describe, expect, it } from 'vitest';
import {
  getDateKey,
  getDayBoundaryDate,
  getPreviousDayKey,
  getSecondsToDate
} from '../../src/lib/functions/statistic-util.ts';

describe('day boundaries', () => {
  it('uses the previous calendar date before an hour-and-minute boundary', () => {
    const beforeBoundary = new Date(2026, 7, 22, 4, 29);
    const atBoundary = new Date(2026, 7, 22, 4, 30);

    expect(getDateKey('04:30', beforeBoundary)).toBe('2026-08-21');
    expect(getDateKey('04:30', atBoundary)).toBe('2026-08-22');
  });

  it('returns the exact boundary time and elapsed seconds', () => {
    const referenceDate = new Date(2026, 7, 22, 4, 45);
    const boundaryDate = getDayBoundaryDate('04:30', referenceDate);

    expect([
      boundaryDate.getFullYear(),
      boundaryDate.getMonth(),
      boundaryDate.getDate(),
      boundaryDate.getHours(),
      boundaryDate.getMinutes()
    ]).toEqual([2026, 7, 22, 4, 30]);
    expect(getSecondsToDate('04:30', referenceDate)).toBe(15 * 60);
  });

  it('finds the previous reading day on either side of the boundary', () => {
    expect(getPreviousDayKey('04:30', new Date(2026, 7, 22, 4, 29))).toBe('2026-08-20');
    expect(getPreviousDayKey('04:30', new Date(2026, 7, 22, 4, 30))).toBe('2026-08-21');
  });
});
