import { describe, expect, it } from 'vitest';
import { JOB_PRIORITY, makeJobId } from './utils';

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
  it('has MANUAL < UPLOAD < CRON (lower = higher priority)', () => {
    expect(JOB_PRIORITY.MANUAL).toBeLessThan(JOB_PRIORITY.UPLOAD);
    expect(JOB_PRIORITY.UPLOAD).toBeLessThan(JOB_PRIORITY.CRON);
  });
});
