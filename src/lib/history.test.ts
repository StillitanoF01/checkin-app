import { describe, expect, it } from 'vitest';
import { computeStreak, previousDate, recentLocalDates } from './history';

describe('previousDate', () => {
  it('steps back one calendar day', () => {
    expect(previousDate('2025-01-15')).toBe('2025-01-14');
  });
  it('crosses month boundaries', () => {
    expect(previousDate('2025-03-01')).toBe('2025-02-28');
  });
  it('crosses year boundaries', () => {
    expect(previousDate('2025-01-01')).toBe('2024-12-31');
  });
});

describe('recentLocalDates', () => {
  it('returns N dates newest-first including today', () => {
    expect(recentLocalDates('2025-01-15', 3)).toEqual([
      '2025-01-15',
      '2025-01-14',
      '2025-01-13',
    ]);
  });
});

describe('computeStreak', () => {
  it('counts consecutive days including today', () => {
    const dates = new Set(['2025-01-15', '2025-01-14', '2025-01-13']);
    expect(computeStreak(dates, '2025-01-15')).toBe(3);
  });

  it('still counts if today is not checked in yet (uses yesterday back)', () => {
    const dates = new Set(['2025-01-14', '2025-01-13']);
    expect(computeStreak(dates, '2025-01-15')).toBe(2);
  });

  it('breaks the streak on a gap', () => {
    const dates = new Set(['2025-01-15', '2025-01-13', '2025-01-12']);
    expect(computeStreak(dates, '2025-01-15')).toBe(1);
  });

  it('is zero when neither today nor yesterday is present', () => {
    const dates = new Set(['2025-01-10']);
    expect(computeStreak(dates, '2025-01-15')).toBe(0);
  });
});
