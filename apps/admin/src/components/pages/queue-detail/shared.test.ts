import { describe, expect, it } from 'vitest';

import {
  formatJobDuration,
  formatSeconds,
  formatTimestamp,
  isStageProgress,
  JOB_STATE_BADGE_MAP,
  JOB_STATES,
} from './shared';

// ── isStageProgress ────────────────────────────────────────────

describe('isStageProgress', () => {
  it('returns true for valid stage progress objects', () => {
    expect(isStageProgress({ stage: 'parsing', startedAt: Date.now() })).toBe(true);
  });

  it('returns false for null', () => {
    expect(isStageProgress(null)).toBe(false);
  });

  it('returns false for a number', () => {
    expect(isStageProgress(42)).toBe(false);
  });

  it('returns false for object without stage string', () => {
    expect(isStageProgress({ stage: 123, startedAt: Date.now() } as never)).toBe(false);
  });

  it('returns false for empty object', () => {
    expect(isStageProgress({} as never)).toBe(false);
  });
});

// ── formatTimestamp ────────────────────────────────────────────

describe('formatTimestamp', () => {
  it('returns em dash for null', () => {
    expect(formatTimestamp(null)).toBe('\u2014');
  });

  it('returns em dash for 0', () => {
    expect(formatTimestamp(0)).toBe('\u2014');
  });

  it('returns a locale string for a valid timestamp', () => {
    const ts = new Date('2025-01-01T00:00:00Z').getTime();
    const result = formatTimestamp(ts);
    // Should be a non-empty string that's not the em dash
    expect(result).not.toBe('\u2014');
    expect(result.length).toBeGreaterThan(0);
  });
});

// ── formatSeconds ──────────────────────────────────────────────

describe('formatSeconds', () => {
  it('formats seconds under 60', () => {
    expect(formatSeconds(45)).toBe('45s');
  });

  it('formats exactly 0 seconds', () => {
    expect(formatSeconds(0)).toBe('0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatSeconds(125)).toBe('2m 5s');
  });

  it('formats exactly 60 seconds as 1m 0s', () => {
    expect(formatSeconds(60)).toBe('1m 0s');
  });

  it('formats hours and minutes', () => {
    expect(formatSeconds(3661)).toBe('1h 1m');
  });

  it('formats exactly 3600 seconds as 1h 0m', () => {
    expect(formatSeconds(3600)).toBe('1h 0m');
  });

  it('formats large values', () => {
    expect(formatSeconds(7200)).toBe('2h 0m');
    expect(formatSeconds(7320)).toBe('2h 2m');
  });
});

// ── formatJobDuration ──────────────────────────────────────────

describe('formatJobDuration', () => {
  it('returns em dash when processedOn is null', () => {
    expect(formatJobDuration(null, null)).toBe('\u2014');
  });

  it('returns em dash when processedOn is 0', () => {
    expect(formatJobDuration(0, null)).toBe('\u2014');
  });

  it('formats milliseconds for short durations', () => {
    const now = Date.now();
    expect(formatJobDuration(now - 500, now)).toBe('500ms');
  });

  it('formats seconds for durations under a minute', () => {
    const now = Date.now();
    expect(formatJobDuration(now - 5000, now)).toBe('5s');
  });

  it('formats minutes and seconds for longer durations', () => {
    const now = Date.now();
    expect(formatJobDuration(now - 125000, now)).toBe('2m 5s');
  });

  it('uses Date.now() when finishedOn is null (still running)', () => {
    const processedOn = Date.now() - 3000;
    const result = formatJobDuration(processedOn, null);
    // Should return a time-based string, not the em dash
    expect(result).not.toBe('\u2014');
  });
});

// ── Constants ──────────────────────────────────────────────────

describe('JOB_STATES', () => {
  it('contains all expected states', () => {
    expect(JOB_STATES).toEqual(['all', 'failed', 'active', 'waiting', 'delayed', 'completed']);
  });
});

describe('JOB_STATE_BADGE_MAP', () => {
  it('maps waiting to pending', () => {
    expect(JOB_STATE_BADGE_MAP.waiting).toBe('pending');
  });

  it('maps active to warning', () => {
    expect(JOB_STATE_BADGE_MAP.active).toBe('warning');
  });

  it('maps completed to success', () => {
    expect(JOB_STATE_BADGE_MAP.completed).toBe('success');
  });

  it('maps failed to error', () => {
    expect(JOB_STATE_BADGE_MAP.failed).toBe('error');
  });

  it('maps delayed to info', () => {
    expect(JOB_STATE_BADGE_MAP.delayed).toBe('info');
  });

  it('returns undefined for unknown states', () => {
    expect(JOB_STATE_BADGE_MAP['unknown']).toBeUndefined();
  });
});
