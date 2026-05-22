import { scores } from '@typhoon/db';
import { DashboardRepo } from '@typhoon/db/repos';
import { clearAllTables, createTestConnection, seedMessage, seedSpan, seedThread } from '@typhoon/db/repos/test-utils';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { DashboardService } from './dashboard.service';

/** Assert the result is a success. */
function expectData<T>(result: { data: T } | { error: string }): asserts result is { data: T } {
  expect('data' in result).toBe(true);
}

describe('DashboardService (integration)', () => {
  const { db, sql } = createTestConnection();
  const service = new DashboardService({ dashboardRepo: new DashboardRepo(db) });

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. getScoreSeries returns buckets and series ───────────────────────

  it('getScoreSeries returns buckets and series', async () => {
    const thread = await seedThread(db);
    const msg = await seedMessage(db, thread.id);

    // Insert scores with specific dates within the range
    await db.insert(scores).values({
      threadId: thread.externalId,
      entityId: msg.id,
      entityType: 'message',
      scorerId: 'answerRelevancy',
      score: 0.8,
      createdAt: new Date('2025-01-03T12:00:00Z'),
    });

    await db.insert(scores).values({
      threadId: thread.externalId,
      entityId: msg.id,
      entityType: 'message',
      scorerId: 'answerRelevancy',
      score: 0.6,
      createdAt: new Date('2025-01-05T12:00:00Z'),
    });

    await db.insert(scores).values({
      threadId: thread.externalId,
      entityId: msg.id,
      entityType: 'message',
      scorerId: 'faithfulness',
      score: 0.9,
      createdAt: new Date('2025-01-04T12:00:00Z'),
    });

    const result = await service.getScoreSeries({
      dateFrom: '2025-01-01T00:00:00Z',
      dateTo: '2025-01-08T00:00:00Z',
      range: '7d',
    });

    expectData(result);

    // Should have time-bucket strings
    expect(result.data.buckets).toBeInstanceOf(Array);
    expect(result.data.buckets.length).toBeGreaterThan(0);

    // Should have series entries with expected fields
    expect(result.data.series).toBeInstanceOf(Array);
    expect(result.data.series.length).toBeGreaterThan(0);

    for (const entry of result.data.series) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('scorerId');
      expect(entry).toHaveProperty('avgScore');
      expect(entry).toHaveProperty('count');
      expect(typeof entry.avgScore).toBe('number');
      expect(typeof entry.count).toBe('number');
    }

    // Verify we have data for both scorers
    const scorerIds = [...new Set(result.data.series.map((s) => s.scorerId))];
    expect(scorerIds).toContain('answerRelevancy');
    expect(scorerIds).toContain('faithfulness');
  });

  // ── 2. getWorstThreads returns ranked threads ──────────────────────────

  it('getWorstThreads returns ranked threads', async () => {
    const threadGood = await seedThread(db, { title: 'Good Thread' });
    const threadBad = await seedThread(db, { title: 'Bad Thread' });

    const msgGood = await seedMessage(db, threadGood.id);
    const msgBad = await seedMessage(db, threadBad.id);

    // Good thread: high answerRelevancy score
    await db.insert(scores).values({
      threadId: threadGood.externalId,
      entityId: msgGood.id,
      entityType: 'message',
      scorerId: 'answerRelevancy',
      score: 0.95,
      createdAt: new Date('2025-01-03T12:00:00Z'),
    });

    // Bad thread: low answerRelevancy score
    await db.insert(scores).values({
      threadId: threadBad.externalId,
      entityId: msgBad.id,
      entityType: 'message',
      scorerId: 'answerRelevancy',
      score: 0.15,
      createdAt: new Date('2025-01-03T12:00:00Z'),
    });

    const result = await service.getWorstThreads({
      dateFrom: '2025-01-01T00:00:00Z',
      dateTo: '2025-01-08T00:00:00Z',
      limit: 10,
    });

    expectData(result);
    expect(result.data.threads.length).toBe(2);

    // Ordered by responseAvg ASC — worst first
    expect(result.data.threads[0].threadId).toBe(threadBad.externalId);
    expect(result.data.threads[0].responseAvg).toBeCloseTo(0.15, 1);

    expect(result.data.threads[1].threadId).toBe(threadGood.externalId);
    expect(result.data.threads[1].responseAvg).toBeCloseTo(0.95, 1);
  });

  // ── 3. getLatencySeries returns percentile data ────────────────────────

  it('getLatencySeries returns percentile data', async () => {
    // Seed agent spans with known durations within date range
    // Span 1: 200ms
    await seedSpan(db, {
      traceId: 'trace-lat-1',
      spanId: 'span-lat-1',
      name: 'Agent Run 1',
      spanType: 'agent',
      startedAt: new Date('2025-01-03T10:00:00.000Z'),
      endedAt: new Date('2025-01-03T10:00:00.200Z'),
    });

    // Span 2: 500ms
    await seedSpan(db, {
      traceId: 'trace-lat-2',
      spanId: 'span-lat-2',
      name: 'Agent Run 2',
      spanType: 'agent',
      startedAt: new Date('2025-01-03T11:00:00.000Z'),
      endedAt: new Date('2025-01-03T11:00:00.500Z'),
    });

    // Span 3: 1000ms
    await seedSpan(db, {
      traceId: 'trace-lat-3',
      spanId: 'span-lat-3',
      name: 'Agent Run 3',
      spanType: 'agent_run',
      startedAt: new Date('2025-01-04T10:00:00.000Z'),
      endedAt: new Date('2025-01-04T10:00:01.000Z'),
    });

    const result = await service.getLatencySeries({
      dateFrom: '2025-01-01T00:00:00Z',
      dateTo: '2025-01-08T00:00:00Z',
      range: '7d',
    });

    expectData(result);
    expect(result.data.series).toBeInstanceOf(Array);
    expect(result.data.series.length).toBeGreaterThan(0);

    // Find buckets that contain data (non-null p50)
    const bucketsWithData = result.data.series.filter((s) => s.p50 !== null);
    expect(bucketsWithData.length).toBeGreaterThan(0);

    for (const entry of bucketsWithData) {
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('p50');
      expect(entry).toHaveProperty('p95');
      expect(entry).toHaveProperty('p99');
      expect(entry).toHaveProperty('count');
      expect(typeof entry.p50).toBe('number');
      expect(typeof entry.p95).toBe('number');
      expect(typeof entry.p99).toBe('number');
      expect(entry.count).toBeGreaterThan(0);
      // p50 <= p95 <= p99 (already asserted non-null via typeof check above)
      expect(entry.p50 as number).toBeLessThanOrEqual(entry.p95 as number);
      expect(entry.p95 as number).toBeLessThanOrEqual(entry.p99 as number);
    }
  });
});
