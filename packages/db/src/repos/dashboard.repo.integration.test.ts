import crypto from 'node:crypto';

import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { scores } from '../schema/scores';
import { DashboardRepo } from './dashboard.repo';
import { clearAllTables, createTestConnection, seedSpan, seedThread, seedUser } from './test-utils';

describe('DashboardRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new DashboardRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── Helpers ──────────────────────────────────────────────────────────

  /** Insert a score with an explicit createdAt timestamp. */
  async function insertScore(opts: {
    threadId: string;
    entityId: string;
    scorerId: string;
    score: number;
    createdAt: Date;
    entityType?: string;
  }) {
    const id = crypto.randomUUID();
    await db.insert(scores).values({
      id,
      threadId: opts.threadId,
      entityId: opts.entityId,
      entityType: opts.entityType ?? 'message',
      scorerId: opts.scorerId,
      score: opts.score,
      createdAt: opts.createdAt,
    });
    return { id };
  }

  // ── 1. queryBuckets generates correct intervals ─────────────────────

  it('queryBuckets generates correct intervals', async () => {
    const buckets = await repo.queryBuckets('2025-01-01T00:00:00Z', '2025-01-03T00:00:00Z', '1 day');

    // 2025-01-01, 2025-01-02, 2025-01-03 => at least 3 bucket timestamps
    expect(buckets.length).toBeGreaterThanOrEqual(3);

    // All values should be parseable as dates
    for (const b of buckets) {
      expect(Number.isNaN(new Date(b).getTime())).toBe(false);
    }
  });

  // ── 2. getScoreSeries computes AVG ──────────────────────────────────

  it('getScoreSeries computes AVG per bucket', async () => {
    const t = await seedThread(db);
    const entityId = crypto.randomUUID();

    // Day 1: two scores => avg 0.6
    await insertScore({
      threadId: t.externalId,
      entityId,
      scorerId: 'faithfulness',
      score: 0.4,
      createdAt: new Date('2025-01-01T12:00:00Z'),
    });
    await insertScore({
      threadId: t.externalId,
      entityId,
      scorerId: 'faithfulness',
      score: 0.8,
      createdAt: new Date('2025-01-01T18:00:00Z'),
    });

    // Day 2: two scores => avg 0.5
    await insertScore({
      threadId: t.externalId,
      entityId,
      scorerId: 'faithfulness',
      score: 0.3,
      createdAt: new Date('2025-01-02T10:00:00Z'),
    });
    await insertScore({
      threadId: t.externalId,
      entityId,
      scorerId: 'faithfulness',
      score: 0.7,
      createdAt: new Date('2025-01-02T14:00:00Z'),
    });

    const rows = await repo.getScoreSeries('2025-01-01T00:00:00Z', '2025-01-02T23:59:59Z', '1 day');

    expect(rows.length).toBe(2);

    // Sort by date to ensure deterministic ordering
    rows.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    expect(rows[0].scorer_id).toBe('faithfulness');
    expect(rows[0].avg_score).toBeCloseTo(0.6, 1);
    expect(rows[0].count).toBe(2);

    expect(rows[1].scorer_id).toBe('faithfulness');
    expect(rows[1].avg_score).toBeCloseTo(0.5, 1);
    expect(rows[1].count).toBe(2);
  });

  // ── 3. getScoreSeries with scorerId filter ──────────────────────────

  it('getScoreSeries filters by scorerId', async () => {
    const t = await seedThread(db);
    const entityId = crypto.randomUUID();
    const ts = new Date('2025-01-15T12:00:00Z');

    await insertScore({ threadId: t.externalId, entityId, scorerId: 'faithfulness', score: 0.9, createdAt: ts });
    await insertScore({ threadId: t.externalId, entityId, scorerId: 'answerRelevancy', score: 0.3, createdAt: ts });

    const rows = await repo.getScoreSeries('2025-01-15T00:00:00Z', '2025-01-15T23:59:59Z', '1 day', 'faithfulness');

    expect(rows.length).toBe(1);
    expect(rows[0].scorer_id).toBe('faithfulness');
    expect(rows[0].avg_score).toBeCloseTo(0.9, 1);
  });

  // ── 4. getWorstThreads ranks by response quality ────────────────────

  it('getWorstThreads ranks by response quality (worst first)', async () => {
    const tLow = await seedThread(db, { title: 'Low Quality' });
    const tHigh = await seedThread(db, { title: 'High Quality' });
    const tNull = await seedThread(db, { title: 'No Response Scores' });

    const entityId = crypto.randomUUID();
    const ts = new Date('2025-02-01T12:00:00Z');

    // Low quality thread: answerRelevancy=0.1, faithfulness=0.2 => response_avg = 0.15
    await insertScore({ threadId: tLow.externalId, entityId, scorerId: 'answerRelevancy', score: 0.1, createdAt: ts });
    await insertScore({ threadId: tLow.externalId, entityId, scorerId: 'faithfulness', score: 0.2, createdAt: ts });

    // High quality thread: answerRelevancy=0.9, faithfulness=0.8 => response_avg = 0.85
    await insertScore({
      threadId: tHigh.externalId,
      entityId,
      scorerId: 'answerRelevancy',
      score: 0.9,
      createdAt: ts,
    });
    await insertScore({ threadId: tHigh.externalId, entityId, scorerId: 'faithfulness', score: 0.8, createdAt: ts });

    // Null response avg: only contextRelevance (no response scorers)
    await insertScore({
      threadId: tNull.externalId,
      entityId,
      scorerId: 'contextRelevance',
      score: 0.5,
      createdAt: ts,
    });

    const rows = await repo.getWorstThreads('2025-02-01T00:00:00Z', '2025-02-01T23:59:59Z', 10);

    expect(rows.length).toBe(3);

    // Worst first, NULLS LAST
    expect(rows[0].thread_id).toBe(tLow.externalId);
    expect(rows[0].response_avg).toBeCloseTo(0.15, 1);

    expect(rows[1].thread_id).toBe(tHigh.externalId);
    expect(rows[1].response_avg).toBeCloseTo(0.85, 1);

    // Null response_avg last
    expect(rows[2].thread_id).toBe(tNull.externalId);
    expect(rows[2].response_avg).toBeNull();
    expect(rows[2].retrieval_avg).toBeCloseTo(0.5, 1);
  });

  // ── 5. getUserQuality aggregates per user ───────────────────────────

  it('getUserQuality aggregates per user', async () => {
    const user1 = await seedUser(db, { name: 'Alice', email: 'alice@typhoon.local' });
    const user2 = await seedUser(db, { name: 'Bob', email: 'bob@typhoon.local' });

    const t1 = await seedThread(db, { resourceId: user1.id });
    const t2 = await seedThread(db, { resourceId: user2.id });

    const entityId = crypto.randomUUID();
    const ts = new Date('2025-03-01T12:00:00Z');

    // User 1 scores: answerRelevancy=0.9
    await insertScore({
      threadId: t1.externalId,
      entityId,
      scorerId: 'answerRelevancy',
      score: 0.9,
      createdAt: ts,
    });

    // User 2 scores: answerRelevancy=0.3
    await insertScore({
      threadId: t2.externalId,
      entityId,
      scorerId: 'answerRelevancy',
      score: 0.3,
      createdAt: ts,
    });

    const rows = await repo.getUserQuality('2025-03-01T00:00:00Z', '2025-03-01T23:59:59Z', 10);

    expect(rows.length).toBe(2);

    // Ordered worst-first (lowest response_avg first)
    expect(rows[0].email).toBe('bob@typhoon.local');
    expect(rows[0].response_avg).toBeCloseTo(0.3, 1);
    expect(rows[0].thread_count).toBe(1);

    expect(rows[1].email).toBe('alice@typhoon.local');
    expect(rows[1].response_avg).toBeCloseTo(0.9, 1);
    expect(rows[1].thread_count).toBe(1);
  });

  // ── 6. getLatencySeries computes percentiles ────────────────────────

  it('getLatencySeries computes percentiles', async () => {
    const baseTime = new Date('2025-04-01T12:00:00Z');

    // Seed 10 agent spans with durations from 100ms to 1000ms
    const durations = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    await Promise.all(
      durations.map((durationMs) =>
        seedSpan(db, {
          traceId: crypto.randomUUID(),
          spanId: crypto.randomUUID(),
          name: 'agent-call',
          spanType: 'agent',
          startedAt: new Date(baseTime.getTime()),
          endedAt: new Date(baseTime.getTime() + durationMs),
        }),
      ),
    );

    const rows = await repo.getLatencySeries('2025-04-01T00:00:00Z', '2025-04-01T23:59:59Z', '1 day');

    expect(rows.length).toBe(1);
    const row = rows[0];

    expect(row.count).toBe(10);
    // Median of 100..1000 step 100 = 550 (PERCENTILE_CONT interpolates)
    expect(row.p50).toBeCloseTo(550, -1);
    // p95 should be near the high end
    expect(row.p95).toBeGreaterThan(800);
    expect(row.p99).toBeGreaterThan(900);
  });

  // ── 7. getCostSeries handles token attributes ──────────────────────

  it('getCostSeries handles gen_ai token attributes', async () => {
    const baseTime = new Date('2025-05-01T12:00:00Z');

    // Seed 3 LLM spans with gen_ai.usage format
    await Promise.all(
      [0, 1, 2].map((i) =>
        seedSpan(db, {
          traceId: crypto.randomUUID(),
          spanId: crypto.randomUUID(),
          name: 'llm-call',
          spanType: 'llm',
          startedAt: new Date(baseTime.getTime() + i * 1000),
          endedAt: new Date(baseTime.getTime() + i * 1000 + 500),
          attributes: {
            'gen_ai.usage.prompt_tokens': 100,
            'gen_ai.usage.completion_tokens': 50,
          },
        }),
      ),
    );

    const rows = await repo.getCostSeries('2025-05-01T00:00:00Z', '2025-05-01T23:59:59Z', '1 day');

    expect(rows.length).toBe(1);
    const row = rows[0];

    expect(row.prompt_tokens).toBe(300); // 100 * 3
    expect(row.completion_tokens).toBe(150); // 50 * 3
    expect(row.call_count).toBe(3);
  });

  // ── 8. getScoreSeries returns empty for future range ────────────────

  it('getScoreSeries returns empty array for date range with no data', async () => {
    const rows = await repo.getScoreSeries('2099-01-01T00:00:00Z', '2099-01-31T23:59:59Z', '1 day');

    expect(rows).toEqual([]);
  });
});
