import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { clearAllTables, createTestConnection, seedSpan } from './test-utils';
import type { TraceListFilters } from './trace.repo';
import { TraceRepo } from './trace.repo';
import type { TraceAggRow } from './trace.repo';

const DATE_FROM = '2025-01-01T00:00:00Z';
const DATE_TO = '2025-12-31T23:59:59Z';

function baseFilters(overrides?: Partial<TraceListFilters>): TraceListFilters {
  return {
    dateFrom: DATE_FROM,
    dateTo: DATE_TO,
    page: 0,
    perPage: 50,
    ...overrides,
  };
}

/** Find a trace by ID and assert it exists. */
function findTrace(rows: TraceAggRow[], traceId: string): TraceAggRow {
  const row = rows.find((r) => r.trace_id === traceId);
  expect(row, `expected trace ${traceId} to exist`).toBeDefined();
  return row as TraceAggRow;
}

describe('TraceRepo (integration)', () => {
  const { db, sql } = createTestConnection();
  const repo = new TraceRepo(db);

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. listTraces with no filters ─────────────────────────────────────────

  it('listTraces returns all traces with correct aggregation', async () => {
    // Trace A: root + child, 200ms duration, no error
    await seedSpan(db, {
      traceId: 'trace-a',
      spanId: 'span-a1',
      name: 'Agent Run A',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:00.200Z'),
      entityType: 'agent',
      entityName: 'knowledge-agent',
    });
    await seedSpan(db, {
      traceId: 'trace-a',
      spanId: 'span-a2',
      name: 'Tool Call A',
      spanType: 'tool',
      startedAt: new Date('2025-06-01T10:00:00.050Z'),
      endedAt: new Date('2025-06-01T10:00:00.150Z'),
      parentSpanId: 'span-a1',
      entityType: 'tool',
      entityName: 'search-tool',
    });

    // Trace B: root + child, 500ms duration
    await seedSpan(db, {
      traceId: 'trace-b',
      spanId: 'span-b1',
      name: 'Agent Run B',
      spanType: 'agent',
      startedAt: new Date('2025-06-02T10:00:00.000Z'),
      endedAt: new Date('2025-06-02T10:00:00.500Z'),
      entityType: 'agent',
      entityName: 'chat-agent',
    });
    await seedSpan(db, {
      traceId: 'trace-b',
      spanId: 'span-b2',
      name: 'LLM Call B',
      spanType: 'llm',
      startedAt: new Date('2025-06-02T10:00:00.100Z'),
      endedAt: new Date('2025-06-02T10:00:00.400Z'),
      parentSpanId: 'span-b1',
    });

    // Trace C: single root span, 1000ms
    await seedSpan(db, {
      traceId: 'trace-c',
      spanId: 'span-c1',
      name: 'Simple Span',
      spanType: 'agent',
      startedAt: new Date('2025-06-03T10:00:00.000Z'),
      endedAt: new Date('2025-06-03T10:00:01.000Z'),
      entityType: 'agent',
      entityName: 'simple-agent',
    });

    const result = await repo.listTraces(baseFilters());

    expect(result.total).toBe(3);
    expect(result.rows).toHaveLength(3);

    const traceC = findTrace(result.rows, 'trace-c');
    expect(traceC.span_count).toBe(1);
    expect(traceC.status).toBe('success');
    expect(traceC.duration_ms).toBeCloseTo(1000, -1);

    const traceA = findTrace(result.rows, 'trace-a');
    expect(traceA.span_count).toBe(2);
    expect(traceA.status).toBe('success');
    expect(traceA.root_span_name).toBe('Agent Run A');
    expect(traceA.duration_ms).toBeCloseTo(200, -1);

    const traceB = findTrace(result.rows, 'trace-b');
    expect(traceB.span_count).toBe(2);
    expect(traceB.duration_ms).toBeCloseTo(500, -1);
  });

  // ── 2. listTraces filtered by status=error ────────────────────────────────

  it('listTraces filters by status=error', async () => {
    // Error trace: has a span with an error
    await seedSpan(db, {
      traceId: 'trace-err',
      spanId: 'span-err1',
      name: 'Failing Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:00.300Z'),
      entityType: 'agent',
      error: { message: 'Something went wrong' },
    });

    // Success trace: no error, all spans completed
    await seedSpan(db, {
      traceId: 'trace-ok',
      spanId: 'span-ok1',
      name: 'Happy Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T11:00:00.000Z'),
      endedAt: new Date('2025-06-01T11:00:00.200Z'),
      entityType: 'agent',
    });

    const result = await repo.listTraces(baseFilters({ status: 'error' }));

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trace_id).toBe('trace-err');
    expect(result.rows[0].status).toBe('error');
    expect(result.rows[0].has_error).toBe(true);
  });

  // ── 3. listTraces filtered by entityType ──────────────────────────────────

  it('listTraces filters by entityType', async () => {
    // Root span with entity_type = 'agent'
    await seedSpan(db, {
      traceId: 'trace-agent',
      spanId: 'span-ag1',
      name: 'Agent Root',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:00.100Z'),
      entityType: 'agent',
      entityName: 'knowledge-agent',
    });

    // Root span with entity_type = 'tool'
    await seedSpan(db, {
      traceId: 'trace-tool',
      spanId: 'span-tl1',
      name: 'Tool Root',
      spanType: 'tool',
      startedAt: new Date('2025-06-01T11:00:00.000Z'),
      endedAt: new Date('2025-06-01T11:00:00.100Z'),
      entityType: 'tool',
      entityName: 'search-tool',
    });

    const result = await repo.listTraces(baseFilters({ entityType: 'agent' }));

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trace_id).toBe('trace-agent');
    expect(result.rows[0].root_entity_type).toBe('agent');
  });

  // ── 4. listTraces filtered by duration range ──────────────────────────────

  it('listTraces filters by minDurationMs', async () => {
    // Fast trace: 100ms
    await seedSpan(db, {
      traceId: 'trace-fast',
      spanId: 'span-f1',
      name: 'Fast Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:00.100Z'),
      entityType: 'agent',
    });

    // Slow trace: 2000ms
    await seedSpan(db, {
      traceId: 'trace-slow',
      spanId: 'span-s1',
      name: 'Slow Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T11:00:00.000Z'),
      endedAt: new Date('2025-06-01T11:00:02.000Z'),
      entityType: 'agent',
    });

    const result = await repo.listTraces(baseFilters({ minDurationMs: 500 }));

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trace_id).toBe('trace-slow');
    expect(Number(result.rows[0].duration_ms)).toBeGreaterThanOrEqual(500);
  });

  // ── 5. listTraces with search ILIKE ───────────────────────────────────────

  it('listTraces filters by case-insensitive search on root span name', async () => {
    await seedSpan(db, {
      traceId: 'trace-ks',
      spanId: 'span-ks1',
      name: 'Knowledge Search',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:00.500Z'),
      entityType: 'agent',
    });

    await seedSpan(db, {
      traceId: 'trace-ca',
      spanId: 'span-ca1',
      name: 'Chat Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T11:00:00.000Z'),
      endedAt: new Date('2025-06-01T11:00:00.500Z'),
      entityType: 'agent',
    });

    // Search with lowercase - should match "Knowledge Search" case-insensitively
    const result = await repo.listTraces(baseFilters({ search: 'knowledge' }));

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trace_id).toBe('trace-ks');
    expect(result.rows[0].root_span_name).toBe('Knowledge Search');
  });

  // ── 6. listTraces pagination ──────────────────────────────────────────────

  it('listTraces paginates correctly', async () => {
    // Create 5 traces in parallel
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => {
        const n = i + 1;
        return seedSpan(db, {
          traceId: `trace-pg-${n}`,
          spanId: `span-pg-${n}`,
          name: `Paginated Trace ${n}`,
          spanType: 'agent',
          startedAt: new Date(`2025-06-0${n}T10:00:00.000Z`),
          endedAt: new Date(`2025-06-0${n}T10:00:00.100Z`),
          entityType: 'agent',
        });
      }),
    );

    // Page 0, perPage 2
    const page0 = await repo.listTraces(baseFilters({ page: 0, perPage: 2 }));
    expect(page0.rows).toHaveLength(2);
    expect(page0.total).toBe(5);

    // Page 1, perPage 2
    const page1 = await repo.listTraces(baseFilters({ page: 1, perPage: 2 }));
    expect(page1.rows).toHaveLength(2);
    expect(page1.total).toBe(5);

    // Page 2, perPage 2 - only 1 remaining
    const page2 = await repo.listTraces(baseFilters({ page: 2, perPage: 2 }));
    expect(page2.rows).toHaveLength(1);
    expect(page2.total).toBe(5);

    // All trace IDs across pages should be unique
    const allIds = [...page0.rows, ...page1.rows, ...page2.rows].map((r) => r.trace_id);
    expect(new Set(allIds).size).toBe(5);
  });

  // ── 7. listTraces all filters combined ────────────────────────────────────

  it('listTraces applies multiple filters as intersection', async () => {
    // Matching trace: agent entity, error, slow, name matches search
    await seedSpan(db, {
      traceId: 'trace-match',
      spanId: 'span-m1',
      name: 'Knowledge Agent Failure',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:01.500Z'),
      entityType: 'agent',
      entityName: 'knowledge-agent',
      error: { message: 'LLM timeout' },
      threadId: 'thread-x',
    });

    // Non-matching: agent entity, error, but too fast (100ms)
    await seedSpan(db, {
      traceId: 'trace-fast-err',
      spanId: 'span-fe1',
      name: 'Knowledge Quick Error',
      spanType: 'agent',
      startedAt: new Date('2025-06-02T10:00:00.000Z'),
      endedAt: new Date('2025-06-02T10:00:00.100Z'),
      entityType: 'agent',
      error: { message: 'fast fail' },
      threadId: 'thread-x',
    });

    // Non-matching: tool entity type (wrong entity)
    await seedSpan(db, {
      traceId: 'trace-tool-err',
      spanId: 'span-te1',
      name: 'Knowledge Tool Error',
      spanType: 'tool',
      startedAt: new Date('2025-06-03T10:00:00.000Z'),
      endedAt: new Date('2025-06-03T10:00:01.500Z'),
      entityType: 'tool',
      error: { message: 'tool fail' },
    });

    // Non-matching: success status (no error)
    await seedSpan(db, {
      traceId: 'trace-ok-agent',
      spanId: 'span-oa1',
      name: 'Knowledge Agent Success',
      spanType: 'agent',
      startedAt: new Date('2025-06-04T10:00:00.000Z'),
      endedAt: new Date('2025-06-04T10:00:01.500Z'),
      entityType: 'agent',
    });

    const result = await repo.listTraces(
      baseFilters({
        status: 'error',
        entityType: 'agent',
        spanType: 'agent',
        minDurationMs: 500,
        maxDurationMs: 5000,
        search: 'Knowledge',
        threadId: 'thread-x',
      }),
    );

    expect(result.total).toBe(1);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].trace_id).toBe('trace-match');
    expect(result.rows[0].status).toBe('error');
    expect(result.rows[0].root_entity_type).toBe('agent');
    expect(Number(result.rows[0].duration_ms)).toBeGreaterThanOrEqual(500);
    expect(Number(result.rows[0].duration_ms)).toBeLessThanOrEqual(5000);
  });

  // ── 8. getSpansByTraceId ──────────────────────────────────────────────────

  it('getSpansByTraceId returns all spans ordered by started_at', async () => {
    const traceId = 'trace-spans';

    // Root span (earliest)
    await seedSpan(db, {
      traceId,
      spanId: 'span-root',
      name: 'Root Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:01.000Z'),
      parentSpanId: null,
      entityType: 'agent',
      entityName: 'knowledge-agent',
      serviceName: 'typhoon-api',
    });

    // Child 1 (middle)
    await seedSpan(db, {
      traceId,
      spanId: 'span-child1',
      name: 'Tool Call 1',
      spanType: 'tool',
      startedAt: new Date('2025-06-01T10:00:00.100Z'),
      endedAt: new Date('2025-06-01T10:00:00.400Z'),
      parentSpanId: 'span-root',
      entityType: 'tool',
      entityName: 'search-tool',
      serviceName: 'typhoon-api',
    });

    // Child 2 (latest)
    await seedSpan(db, {
      traceId,
      spanId: 'span-child2',
      name: 'LLM Call',
      spanType: 'llm',
      startedAt: new Date('2025-06-01T10:00:00.500Z'),
      endedAt: new Date('2025-06-01T10:00:00.900Z'),
      parentSpanId: 'span-root',
      entityType: 'llm',
      entityName: 'gpt-4',
      serviceName: 'typhoon-api',
    });

    // Unrelated trace span - should not appear
    await seedSpan(db, {
      traceId: 'trace-other',
      spanId: 'span-other',
      name: 'Other Span',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:00.100Z'),
    });

    const spans = await repo.getSpansByTraceId(traceId);

    expect(spans).toHaveLength(3);

    // Verify ordering by started_at ASC
    expect(spans[0].span_id).toBe('span-root');
    expect(spans[1].span_id).toBe('span-child1');
    expect(spans[2].span_id).toBe('span-child2');

    // Verify span fields
    expect(spans[0].name).toBe('Root Agent');
    expect(spans[0].parent_span_id).toBeNull();
    expect(spans[0].entity_type).toBe('agent');
    expect(spans[0].service_name).toBe('typhoon-api');

    expect(spans[1].name).toBe('Tool Call 1');
    expect(spans[1].parent_span_id).toBe('span-root');

    expect(spans[2].name).toBe('LLM Call');
    expect(spans[2].span_type).toBe('llm');
  });

  // ── Edge cases ────────────────────────────────────────────────────────────

  describe('status calculation edge cases', () => {
    it('reports partial status when a span has no ended_at', async () => {
      // Root completed, child still running (no ended_at, not model_chunk)
      await seedSpan(db, {
        traceId: 'trace-partial',
        spanId: 'span-p1',
        name: 'Partial Agent',
        spanType: 'agent',
        startedAt: new Date('2025-06-01T10:00:00.000Z'),
        endedAt: new Date('2025-06-01T10:00:01.000Z'),
        entityType: 'agent',
      });
      await seedSpan(db, {
        traceId: 'trace-partial',
        spanId: 'span-p2',
        name: 'Running Tool',
        spanType: 'tool',
        startedAt: new Date('2025-06-01T10:00:00.100Z'),
        endedAt: null,
        parentSpanId: 'span-p1',
      });

      const result = await repo.listTraces(baseFilters({ status: 'partial' }));

      expect(result.total).toBe(1);
      expect(result.rows[0].trace_id).toBe('trace-partial');
      expect(result.rows[0].status).toBe('partial');
      expect(result.rows[0].all_completed).toBe(false);
    });

    it('treats model_chunk spans without ended_at as completed', async () => {
      // Single model_chunk span with no ended_at should still be "success"
      await seedSpan(db, {
        traceId: 'trace-chunk',
        spanId: 'span-chunk',
        name: 'Streaming Chunk',
        spanType: 'model_chunk',
        startedAt: new Date('2025-06-01T10:00:00.000Z'),
        endedAt: null,
      });

      const result = await repo.listTraces(baseFilters());

      const chunk = findTrace(result.rows, 'trace-chunk');
      expect(chunk.all_completed).toBe(true);
      // duration_ms will be null since no ended_at, but all_completed is true
      expect(chunk.status).toBe('success');
    });
  });

  describe('date range filtering', () => {
    it('excludes traces outside the date range', async () => {
      // Inside range
      await seedSpan(db, {
        traceId: 'trace-in-range',
        spanId: 'span-ir1',
        name: 'In Range',
        spanType: 'agent',
        startedAt: new Date('2025-06-15T10:00:00.000Z'),
        endedAt: new Date('2025-06-15T10:00:00.500Z'),
      });

      // Outside range (2024)
      await seedSpan(db, {
        traceId: 'trace-out-range',
        spanId: 'span-or1',
        name: 'Out of Range',
        spanType: 'agent',
        startedAt: new Date('2024-06-15T10:00:00.000Z'),
        endedAt: new Date('2024-06-15T10:00:00.500Z'),
      });

      const result = await repo.listTraces(baseFilters());

      expect(result.total).toBe(1);
      expect(result.rows[0].trace_id).toBe('trace-in-range');
    });
  });

  describe('threadId inner filter', () => {
    it('filters spans by threadId before aggregation', async () => {
      // Trace with threadId
      await seedSpan(db, {
        traceId: 'trace-thread',
        spanId: 'span-th1',
        name: 'Thread Agent',
        spanType: 'agent',
        startedAt: new Date('2025-06-01T10:00:00.000Z'),
        endedAt: new Date('2025-06-01T10:00:00.500Z'),
        threadId: 'my-thread-id',
      });

      // Trace without threadId
      await seedSpan(db, {
        traceId: 'trace-no-thread',
        spanId: 'span-nt1',
        name: 'No Thread Agent',
        spanType: 'agent',
        startedAt: new Date('2025-06-01T11:00:00.000Z'),
        endedAt: new Date('2025-06-01T11:00:00.500Z'),
      });

      const result = await repo.listTraces(baseFilters({ threadId: 'my-thread-id' }));

      expect(result.total).toBe(1);
      expect(result.rows[0].trace_id).toBe('trace-thread');
      expect(result.rows[0].thread_id).toBe('my-thread-id');
    });
  });
});
