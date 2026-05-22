import { TraceRepo } from '@typhoon/db/repos';
import { clearAllTables, createTestConnection, seedSpan } from '@typhoon/db/repos/test-utils';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { TraceService } from './trace.service';

/** Assert the result is a success. */
function expectData<T>(result: { data: T } | { error: string }): asserts result is { data: T } {
  expect('data' in result).toBe(true);
}

/** Assert the result is an error. */
function expectError(result: { data: unknown } | { error: string }): asserts result is { error: string } {
  expect('error' in result).toBe(true);
}

describe('TraceService (integration)', () => {
  const { db, sql } = createTestConnection();
  const service = new TraceService({ traceRepo: new TraceRepo(db) });

  beforeEach(async () => {
    await clearAllTables(db);
  });

  afterAll(async () => {
    await clearAllTables(db);
    await sql.end();
  });

  // ── 1. listTraces returns transformed rows ─────────────────────────────

  it('listTraces returns transformed rows', async () => {
    // Trace 1: root + child spans
    await seedSpan(db, {
      traceId: 'trace-svc-1',
      spanId: 'span-svc-1a',
      name: 'Knowledge Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:00.500Z'),
      entityType: 'agent',
      entityName: 'knowledge-agent',
      threadId: 'thread-abc',
      serviceName: 'typhoon-api',
    });
    await seedSpan(db, {
      traceId: 'trace-svc-1',
      spanId: 'span-svc-1b',
      name: 'Tool Call',
      spanType: 'tool',
      startedAt: new Date('2025-06-01T10:00:00.100Z'),
      endedAt: new Date('2025-06-01T10:00:00.400Z'),
      parentSpanId: 'span-svc-1a',
    });

    // Trace 2: single span with error
    await seedSpan(db, {
      traceId: 'trace-svc-2',
      spanId: 'span-svc-2a',
      name: 'Failing Agent',
      spanType: 'agent',
      startedAt: new Date('2025-06-02T10:00:00.000Z'),
      endedAt: new Date('2025-06-02T10:00:01.000Z'),
      entityType: 'agent',
      entityName: 'supervisor',
      error: { message: 'Timeout' },
    });

    const result = await service.listTraces({
      dateFrom: '2025-01-01T00:00:00Z',
      dateTo: '2025-12-31T23:59:59Z',
      page: 0,
      perPage: 50,
    });

    expectData(result);
    expect(result.data.traces).toHaveLength(2);
    expect(result.data.total).toBe(2);
    expect(result.data.page).toBe(0);
    expect(result.data.perPage).toBe(50);
    expect(result.data.hasMore).toBe(false);

    // Verify camelCase fields on trace 1
    const trace1 = result.data.traces.find((t) => t.traceId === 'trace-svc-1');
    if (!trace1) throw new Error('expected trace-svc-1 to exist');
    expect(trace1.rootSpanName).toBe('Knowledge Agent');
    expect(trace1.rootSpanType).toBe('agent');
    expect(trace1.rootEntityType).toBe('agent');
    expect(trace1.rootEntityName).toBe('knowledge-agent');
    expect(trace1.threadId).toBe('thread-abc');
    expect(trace1.serviceName).toBe('typhoon-api');
    expect(trace1.status).toBe('success');
    expect(trace1.spanCount).toBe(2);
    expect(trace1.durationMs).toBeCloseTo(500, -2);

    // Verify trace 2 has error status
    const trace2 = result.data.traces.find((t) => t.traceId === 'trace-svc-2');
    if (!trace2) throw new Error('expected trace-svc-2 to exist');
    expect(trace2.status).toBe('error');
    expect(trace2.spanCount).toBe(1);
  });

  // ── 2. getDetail builds span tree with token counts ────────────────────

  it('getDetail builds span tree with token counts', async () => {
    const traceId = 'trace-detail';

    // Root span
    await seedSpan(db, {
      traceId,
      spanId: 'span-root',
      name: 'Agent Run',
      spanType: 'agent',
      startedAt: new Date('2025-06-01T10:00:00.000Z'),
      endedAt: new Date('2025-06-01T10:00:01.000Z'),
      parentSpanId: null,
      entityType: 'agent',
      entityName: 'knowledge-agent',
      threadId: 'thread-xyz',
      serviceName: 'typhoon-api',
    });

    // Child span with token usage attributes
    await seedSpan(db, {
      traceId,
      spanId: 'span-child',
      name: 'LLM Call',
      spanType: 'llm',
      startedAt: new Date('2025-06-01T10:00:00.200Z'),
      endedAt: new Date('2025-06-01T10:00:00.800Z'),
      parentSpanId: 'span-root',
      entityType: 'llm',
      entityName: 'gpt-4',
      attributes: {
        'gen_ai.usage.prompt_tokens': 100,
        'gen_ai.usage.completion_tokens': 50,
      },
    });

    const result = await service.getDetail(traceId);

    expectData(result);
    expect(result.data.traceId).toBe(traceId);

    // Verify spans
    expect(result.data.spans).toHaveLength(2);

    const rootSpan = result.data.spans.find((s) => s.spanId === 'span-root');
    if (!rootSpan) throw new Error('expected span-root to exist');
    expect(rootSpan.parentSpanId).toBeNull();
    expect(rootSpan.name).toBe('Agent Run');

    const childSpan = result.data.spans.find((s) => s.spanId === 'span-child');
    if (!childSpan) throw new Error('expected span-child to exist');
    expect(childSpan.parentSpanId).toBe('span-root');
    expect(childSpan.promptTokens).toBe(100);
    expect(childSpan.completionTokens).toBe(50);
    expect(childSpan.durationMs).toBeCloseTo(600, -2);

    // Verify summary
    expect(result.data.summary.status).toBe('success');
    expect(result.data.summary.spanCount).toBe(2);
    expect(result.data.summary.durationMs).toBeCloseTo(1000, -2);
    expect(result.data.summary.rootSpanName).toBe('Agent Run');
    expect(result.data.summary.threadId).toBe('thread-xyz');
    expect(result.data.summary.startedAt).toBeDefined();
    expect(result.data.summary.endedAt).toBeDefined();
  });

  // ── 3. getDetail returns error for nonexistent trace ───────────────────

  it('getDetail returns error for nonexistent trace', async () => {
    const result = await service.getDetail('nonexistent-trace-id');

    expectError(result);
    expect(result.error).toBe('Trace not found');
  });
});
