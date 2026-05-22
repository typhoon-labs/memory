import { describe, expect, it } from 'vitest';

import { formatDateForRange, getTimeTicks } from './chart-utils';

describe('formatDateForRange', () => {
  const dateStr = '2025-06-15T14:30:00Z';

  it('formats for 1d range with time', () => {
    const result = formatDateForRange(dateStr, '1d');
    expect(result).toMatch(/\d/);
  });

  it('formats for 3d range with weekday and hour', () => {
    const result = formatDateForRange(dateStr, '3d');
    expect(result).toMatch(/\w/);
  });

  it('formats for 7d range with weekday and day', () => {
    const result = formatDateForRange(dateStr, '7d');
    expect(result).toMatch(/\w/);
  });

  it('formats for 30d range with month and day', () => {
    const result = formatDateForRange(dateStr, '30d');
    expect(result).toMatch(/\w/);
  });

  it('formats for 90d range with month and day', () => {
    const result = formatDateForRange(dateStr, '90d');
    expect(result).toMatch(/\w/);
  });
});

describe('getTimeTicks', () => {
  it('returns empty array for empty input', () => {
    expect(getTimeTicks([], '7d')).toEqual([]);
  });

  it('returns single date for single input', () => {
    expect(getTimeTicks(['2025-06-15T00:00:00Z'], '7d')).toEqual(['2025-06-15T00:00:00Z']);
  });

  it('returns first date and spaced dates for 1d range', () => {
    // 2-hour spacing for 1d
    const dates = [
      '2025-06-15T00:00:00Z',
      '2025-06-15T01:00:00Z',
      '2025-06-15T02:00:00Z',
      '2025-06-15T03:00:00Z',
      '2025-06-15T04:00:00Z',
    ];
    const ticks = getTimeTicks(dates, '1d');
    // First date always included, then 2h spacing so 02:00 should be included
    expect(ticks[0]).toBe('2025-06-15T00:00:00Z');
    expect(ticks.length).toBeGreaterThanOrEqual(2);
  });

  it('returns spaced dates for 30d range', () => {
    // 2-day spacing for 30d
    const dates: string[] = [];
    for (let i = 0; i < 30; i++) {
      dates.push(`2025-06-${String(i + 1).padStart(2, '0')}T00:00:00Z`);
    }
    const ticks = getTimeTicks(dates, '30d');
    expect(ticks[0]).toBe('2025-06-01T00:00:00Z');
    // With 2-day spacing, should have ~15 ticks from 30 days
    expect(ticks.length).toBeGreaterThan(5);
    expect(ticks.length).toBeLessThan(30);
  });

  it('returns spaced dates for 90d range', () => {
    // 7-day spacing for 90d
    const dates: string[] = [];
    const start = new Date('2025-01-01T00:00:00Z');
    for (let i = 0; i < 90; i++) {
      const d = new Date(start.getTime() + i * 86_400_000);
      dates.push(d.toISOString());
    }
    const ticks = getTimeTicks(dates, '90d');
    expect(ticks[0]).toBe(dates[0]);
    expect(ticks.length).toBeGreaterThan(5);
    expect(ticks.length).toBeLessThan(20);
  });

  it('includes only first date when all within spacing threshold', () => {
    // For 7d (12h spacing), dates within 12h should produce only 1 tick
    const dates = ['2025-06-15T00:00:00Z', '2025-06-15T06:00:00Z', '2025-06-15T11:00:00Z'];
    const ticks = getTimeTicks(dates, '7d');
    expect(ticks).toEqual(['2025-06-15T00:00:00Z']);
  });
});
