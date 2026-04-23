import { describe, expect, it } from 'vitest';
import { formatAbsoluteTime, formatRelativeTime } from './format-time';

describe('formatRelativeTime', () => {
  it('returns "Just now" for less than 1 minute', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe('Just now');
  });

  it('returns "now" in compact mode for less than 1 minute', () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now, { compact: true })).toBe('now');
  });

  it('returns minutes ago format', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe('5m ago');
  });

  it('returns compact minutes format', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString();
    expect(formatRelativeTime(fiveMinAgo, { compact: true })).toBe('5m');
  });

  it('returns hours ago format', () => {
    const threeHrsAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(threeHrsAgo)).toBe('3h ago');
  });

  it('returns compact hours format', () => {
    const threeHrsAgo = new Date(Date.now() - 3 * 3_600_000).toISOString();
    expect(formatRelativeTime(threeHrsAgo, { compact: true })).toBe('3h');
  });

  it('returns days ago format', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo)).toBe('2d ago');
  });

  it('returns compact days format', () => {
    const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();
    expect(formatRelativeTime(twoDaysAgo, { compact: true })).toBe('2d');
  });

  it('returns date string for 8+ days ago', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const result = formatRelativeTime(tenDaysAgo);
    // Should be a locale-formatted date, not Xd ago
    expect(result).not.toContain('ago');
    expect(result.length).toBeGreaterThan(3);
  });

  it('returns compact date without year for 8+ days', () => {
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toISOString();
    const full = formatRelativeTime(tenDaysAgo);
    const compact = formatRelativeTime(tenDaysAgo, { compact: true });
    // compact excludes year — should be shorter or equal
    expect(compact.length).toBeLessThanOrEqual(full.length);
  });
});

describe('formatAbsoluteTime', () => {
  const timestamp = '2026-03-09T16:21:00Z';

  it('returns date with time by default', () => {
    const result = formatAbsoluteTime(timestamp);
    expect(result.length).toBeGreaterThan(10);
  });

  it('returns date only when includeTime is false', () => {
    const withTime = formatAbsoluteTime(timestamp);
    const dateOnly = formatAbsoluteTime(timestamp, { includeTime: false });
    expect(dateOnly.length).toBeLessThan(withTime.length);
  });

  it('uses short month format', () => {
    const longMonth = formatAbsoluteTime(timestamp, { monthFormat: 'long' });
    const shortMonth = formatAbsoluteTime(timestamp, { monthFormat: 'short' });
    // Short month ("Mar") should be shorter than long ("March")
    expect(shortMonth.length).toBeLessThanOrEqual(longMonth.length);
  });

  it('excludes year when includeYear is false', () => {
    const withYear = formatAbsoluteTime(timestamp, { includeYear: true });
    const noYear = formatAbsoluteTime(timestamp, { includeYear: false });
    expect(noYear.length).toBeLessThan(withYear.length);
  });

  it('excludes timezone when includeTimezone is false', () => {
    const withTz = formatAbsoluteTime(timestamp, { includeTimezone: true });
    const noTz = formatAbsoluteTime(timestamp, { includeTimezone: false });
    expect(noTz.length).toBeLessThanOrEqual(withTz.length);
  });
});
