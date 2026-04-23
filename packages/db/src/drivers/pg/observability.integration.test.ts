import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DrizzleObservabilityStorage } from './observability';
import { createTestConnection } from './test-utils';

describe('DrizzleObservabilityStorage (integration)', () => {
  const { db, sql } = createTestConnection();
  let storage: DrizzleObservabilityStorage;

  beforeAll(() => {
    // connection set up at module level
    storage = new DrizzleObservabilityStorage(db);
  });

  beforeEach(async () => {
    await storage.dangerouslyClearAll();
  });

  afterAll(async () => {
    await storage.dangerouslyClearAll();
    await sql.end();
  });

  it('createSpan and getSpan', async () => {
    const spanId = crypto.randomUUID();

    await storage.createSpan({
      span: {
        id: spanId,
        traceId: 'trace-1',
        spanId: 'span-1',
        name: 'test-span',
        spanType: 'AGENT_RUN',
        isEvent: false,
        startedAt: new Date(),
      },
    });

    const fetched = await storage.getSpan({ id: spanId });
    expect(fetched).not.toBeNull();
    expect((fetched as Record<string, string>).name).toBe('test-span');
  });

  it('updateSpan', async () => {
    const spanId = crypto.randomUUID();

    await storage.createSpan({
      span: {
        id: spanId,
        traceId: 'trace-upd',
        spanId: 'span-upd',
        name: 'original',
        spanType: 'AGENT_RUN',
        isEvent: false,
        startedAt: new Date(),
      },
    });

    await storage.updateSpan({
      span: { id: spanId, endedAt: new Date(), output: { result: 'done' } },
    });

    const fetched = await storage.getSpan({ id: spanId });
    expect((fetched as Record<string, unknown>).ended_at).not.toBeNull();
  });

  it('getTrace returns all spans for a trace', async () => {
    const s1 = crypto.randomUUID();
    const s2 = crypto.randomUUID();

    await storage.createSpan({
      span: {
        id: s1,
        traceId: 'trace-multi',
        spanId: 's1',
        name: 'root',
        spanType: 'AGENT_RUN',
        isEvent: false,
        startedAt: new Date(),
      },
    });
    await storage.createSpan({
      span: {
        id: s2,
        traceId: 'trace-multi',
        spanId: 's2',
        name: 'child',
        spanType: 'TOOL_RUN',
        isEvent: false,
        startedAt: new Date(),
        parentSpanId: 's1',
      },
    });

    const trace = await storage.getTrace({ traceId: 'trace-multi' });
    expect(trace).not.toBeNull();
    expect((trace as Record<string, unknown[]>).spans.length).toBe(2);
  });

  it('getTrace returns null for non-existent', async () => {
    const result = await storage.getTrace({ traceId: 'no-such-trace' });
    expect(result).toBeNull();
  });

  it('batchCreateSpans', async () => {
    const b1 = crypto.randomUUID();
    const b2 = crypto.randomUUID();

    await storage.batchCreateSpans({
      spans: [
        {
          id: b1,
          traceId: 't-batch',
          spanId: 'b1',
          name: 'span-1',
          spanType: 'AGENT_RUN',
          isEvent: false,
          startedAt: new Date(),
        },
        {
          id: b2,
          traceId: 't-batch',
          spanId: 'b2',
          name: 'span-2',
          spanType: 'TOOL_RUN',
          isEvent: false,
          startedAt: new Date(),
        },
      ],
    });

    const trace = await storage.getTrace({ traceId: 't-batch' });
    expect((trace as Record<string, unknown[]>).spans.length).toBe(2);
  });

  it('batchDeleteTraces', async () => {
    const delId = crypto.randomUUID();

    await storage.createSpan({
      span: {
        id: delId,
        traceId: 'del-trace',
        spanId: 'del-1',
        name: 'x',
        spanType: 'AGENT_RUN',
        isEvent: false,
        startedAt: new Date(),
      },
    });

    await storage.batchDeleteTraces({ traceIds: ['del-trace'] });
    const result = await storage.getTrace({ traceId: 'del-trace' });
    expect(result).toBeNull();
  });

  it('getRootSpan', async () => {
    const rootId = crypto.randomUUID();
    const childId = crypto.randomUUID();

    await storage.createSpan({
      span: {
        id: rootId,
        traceId: 'root-t',
        spanId: 'root-s',
        name: 'root',
        spanType: 'AGENT_RUN',
        isEvent: false,
        startedAt: new Date(),
      },
    });
    await storage.createSpan({
      span: {
        id: childId,
        traceId: 'root-t',
        spanId: 'child-s',
        name: 'child',
        spanType: 'TOOL_RUN',
        isEvent: false,
        startedAt: new Date(),
        parentSpanId: 'root-s',
      },
    });

    const root = await storage.getRootSpan({ traceId: 'root-t' });
    expect((root as Record<string, string>).name).toBe('root');
  });
});
