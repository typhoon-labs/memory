import { describe, expect, it } from 'vitest';

import { childPriorityFor, JOB_PRIORITY, makeJobId } from './utils';

describe('makeJobId', () => {
  it('returns a UUID-formatted string', () => {
    const id = makeJobId('a', 'b', 'c');
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it('is deterministic — same inputs produce same output', () => {
    const id1 = makeJobId('sync', 'target-1');
    const id2 = makeJobId('sync', 'target-1');
    expect(id1).toBe(id2);
  });

  it('different inputs produce different outputs', () => {
    const id1 = makeJobId('sync', 'target-1');
    const id2 = makeJobId('sync', 'target-2');
    expect(id1).not.toBe(id2);
  });
});

describe('JOB_PRIORITY', () => {
  it('has scan tiers < child tiers (lower = higher priority)', () => {
    expect(JOB_PRIORITY.MANUAL).toBeLessThan(JOB_PRIORITY.UPLOAD);
    expect(JOB_PRIORITY.UPLOAD).toBeLessThan(JOB_PRIORITY.CRON);
    expect(JOB_PRIORITY.CRON).toBeLessThan(JOB_PRIORITY.CHILD_MANUAL);
    expect(JOB_PRIORITY.CHILD_MANUAL).toBeLessThan(JOB_PRIORITY.CHILD_CRON);
  });
});

describe('childPriorityFor', () => {
  it('maps MANUAL scan priority to CHILD_MANUAL', () => {
    expect(childPriorityFor(JOB_PRIORITY.MANUAL)).toBe(JOB_PRIORITY.CHILD_MANUAL);
  });

  it('maps CRON scan priority to CHILD_CRON', () => {
    expect(childPriorityFor(JOB_PRIORITY.CRON)).toBe(JOB_PRIORITY.CHILD_CRON);
  });

  it('defaults to CHILD_CRON for undefined priority', () => {
    expect(childPriorityFor(undefined)).toBe(JOB_PRIORITY.CHILD_CRON);
  });

  it('defaults to CHILD_CRON for unknown priority values', () => {
    expect(childPriorityFor(99)).toBe(JOB_PRIORITY.CHILD_CRON);
  });
});
