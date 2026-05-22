import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assertOk } from '../test-helpers';
import type { TraceServiceDeps } from './trace.service';
import { TraceService } from './trace.service';

// ── Helpers ──────────────────────────────────────────────────────────

function createMockDeps(overrides: Partial<TraceServiceDeps> = {}): TraceServiceDeps {
  return {
    traceRepo: {
      listTraces: vi.fn().mockResolvedValue({ rows: [], total: 0 }),
      getSpansByTraceId: vi.fn().mockResolvedValue([]),
    } as unknown as TraceServiceDeps['traceRepo'],
    ...overrides,
  };
}

function makeSpanRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'span-internal-1',
    span_id: 'span-1',
    parent_span_id: null,
    name: 'root-span',
    span_type: 'agent',
    started_at: '2026-01-15T10:00:00.000Z',
    ended_at: '2026-01-15T10:00:01.000Z',
    attributes: null,
    input: null,
    output: null,
    error: null,
    entity_type: 'agent',
    entity_name: 'supervisor',
    thread_id: 'thread-1',
    service_name: 'typhoon-api',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────

describe('TraceService', () => {
  let deps: TraceServiceDeps;
  let service: TraceService;

  beforeEach(() => {
    vi.clearAllMocks();
    deps = createMockDeps();
    service = new TraceService(deps);
  });

  describe('listTraces', () => {
    it('returns mapped and paginated traces', async () => {
      vi.mocked(deps.traceRepo.listTraces).mockResolvedValueOnce({
        rows: [
          {
            trace_id: 'trace-1',
            root_span_name: 'agent.run',
            root_span_type: 'agent',
            root_entity_type: 'agent',
            root_entity_name: 'supervisor',
            thread_id: 'thread-1',
            service_name: 'typhoon-api',
            status: 'success',
            span_count: 5,
            duration_ms: 1234.5,
            started_at: '2026-01-15T10:00:00Z',
            ended_at: '2026-01-15T10:00:01Z',
          },
        ],
        total: 1,
      } as never);

      const result = await service.listTraces({ page: 0, perPage: 20 } as never);
      const data = assertOk(result);
      expect(data.traces).toHaveLength(1);
      expect(data.traces[0]).toMatchObject({
        traceId: 'trace-1',
        rootSpanName: 'agent.run',
        durationMs: 1235, // rounded
        status: 'success',
      });
      expect(data.total).toBe(1);
      expect(data.hasMore).toBe(false);
    });

    it('computes hasMore correctly', async () => {
      vi.mocked(deps.traceRepo.listTraces).mockResolvedValueOnce({
        rows: [{ trace_id: 't-1', root_span_name: 'x', root_span_type: 'agent', status: 'success', span_count: 1 }],
        total: 50,
      } as never);

      const result = await service.listTraces({ page: 0, perPage: 10 } as never);
      const data = assertOk(result);
      expect(data.hasMore).toBe(true);
    });

    it('handles null durationMs', async () => {
      vi.mocked(deps.traceRepo.listTraces).mockResolvedValueOnce({
        rows: [
          {
            trace_id: 't-1',
            root_span_name: 'x',
            root_span_type: 'agent',
            root_entity_type: null,
            root_entity_name: null,
            thread_id: null,
            service_name: null,
            status: 'partial',
            span_count: 1,
            duration_ms: null,
            started_at: '2026-01-15T10:00:00Z',
            ended_at: null,
          },
        ],
        total: 1,
      } as never);

      const result = await service.listTraces({ page: 0, perPage: 10 } as never);
      const data = assertOk(result);
      expect(data.traces[0].durationMs).toBeNull();
    });
  });

  describe('getDetail', () => {
    it('returns trace detail with span tree and summary', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([
        makeSpanRow(),
        makeSpanRow({
          id: 'span-internal-2',
          span_id: 'span-2',
          parent_span_id: 'span-1',
          name: 'tool-call',
          span_type: 'tool',
          started_at: '2026-01-15T10:00:00.200Z',
          ended_at: '2026-01-15T10:00:00.800Z',
        }),
      ] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.traceId).toBe('trace-1');
      expect(data.spans).toHaveLength(2);
      expect(data.summary.status).toBe('success');
      expect(data.summary.spanCount).toBe(2);
      expect(data.summary.rootSpanName).toBe('root-span');
      expect(data.summary.durationMs).toBe(1000);
    });

    it('returns error when no spans found', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([] as never);
      const result = await service.getDetail('nonexistent');
      expect('error' in result).toBe(true);
    });

    it('computes span duration from timestamps', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([
        makeSpanRow({
          started_at: '2026-01-15T10:00:00.000Z',
          ended_at: '2026-01-15T10:00:02.500Z',
        }),
      ] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.spans[0].durationMs).toBe(2500);
    });

    it('returns null duration for spans without ended_at', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([makeSpanRow({ ended_at: null })] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.spans[0].durationMs).toBeNull();
    });

    it('derives error status when any span has an error', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([
        makeSpanRow({ error: { message: 'something failed' } }),
      ] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.summary.status).toBe('error');
    });

    it('derives partial status when spans are not all completed', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([
        makeSpanRow({ ended_at: null, span_type: 'agent' }),
      ] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.summary.status).toBe('partial');
    });

    it('extracts token counts from OTel-style flat attributes', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([
        makeSpanRow({
          attributes: {
            'gen_ai.usage.prompt_tokens': 100,
            'gen_ai.usage.completion_tokens': 50,
          },
        }),
      ] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.spans[0].promptTokens).toBe(100);
      expect(data.spans[0].completionTokens).toBe(50);
    });

    it('extracts token counts from Mastra-style nested attributes', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([
        makeSpanRow({
          attributes: {
            usage: { inputTokens: 200, outputTokens: 75 },
          },
        }),
      ] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.spans[0].promptTokens).toBe(200);
      expect(data.spans[0].completionTokens).toBe(75);
    });

    it('returns null tokens when attributes are absent', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([makeSpanRow({ attributes: null })] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.spans[0].promptTokens).toBeNull();
      expect(data.spans[0].completionTokens).toBeNull();
    });

    it('treats model_chunk spans as completed for status derivation', async () => {
      vi.mocked(deps.traceRepo.getSpansByTraceId).mockResolvedValueOnce([
        makeSpanRow(),
        makeSpanRow({
          id: 'span-2',
          span_id: 'span-2',
          parent_span_id: 'span-1',
          name: 'chunk',
          span_type: 'model_chunk',
          ended_at: null,
        }),
      ] as never);

      const result = await service.getDetail('trace-1');
      const data = assertOk(result);
      expect(data.summary.status).toBe('success');
    });
  });
});
