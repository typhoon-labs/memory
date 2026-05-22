import type { SpanRow, TraceListFilters, TraceRepo } from '@typhoon/db/repos';

import type { Result } from '../types';

export interface TraceServiceDeps {
  traceRepo: TraceRepo;
}

export interface TraceListResult {
  traces: Array<{
    traceId: string;
    rootSpanName: string;
    rootSpanType: string;
    rootEntityType: string | null;
    rootEntityName: string | null;
    threadId: string | null;
    serviceName: string | null;
    status: string;
    spanCount: number;
    durationMs: number | null;
    startedAt: string;
    endedAt: string | null;
  }>;
  total: number;
  page: number;
  perPage: number;
  hasMore: boolean;
}

export interface TraceDetailResult {
  traceId: string;
  spans: Array<{
    id: string;
    spanId: string;
    parentSpanId: string | null;
    name: string;
    spanType: string;
    startedAt: string;
    endedAt: string | null;
    durationMs: number | null;
    attributes: Record<string, unknown> | null;
    input: unknown;
    output: unknown;
    error: { message: string; name?: string; stack?: string } | null;
    entityType: string | null;
    entityName: string | null;
    threadId: string | null;
    serviceName: string | null;
    promptTokens: number | null;
    completionTokens: number | null;
  }>;
  summary: {
    status: 'success' | 'error' | 'partial';
    spanCount: number;
    durationMs: number | null;
    rootSpanName: string;
    threadId: string | null;
    startedAt: string;
    endedAt: string | null;
  };
}

/** Extract an integer token count from attributes, checking both OTel and Mastra key formats. */
function extractTokens(attributes: Record<string, unknown> | null, ...keys: string[]): number | null {
  if (!attributes) return null;
  for (const key of keys) {
    // Try direct flat-key lookup (OTel-style: 'gen_ai.usage.prompt_tokens')
    if (key in attributes) {
      const n = Number(attributes[key]);
      if (Number.isFinite(n)) return n;
    }
    // Fall back to dot-path traversal (nested Mastra-style: { usage: { inputTokens: 100 } })
    const parts = key.split('.');
    let val: unknown = attributes;
    for (const p of parts) {
      if (val === null || val === undefined || typeof val !== 'object') {
        val = undefined;
        break;
      }
      val = (val as Record<string, unknown>)[p];
    }
    if (val !== null && val !== undefined) {
      const n = Number(val);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/** Compute trace status from span data. */
function deriveStatus(hasError: boolean, allCompleted: boolean): 'success' | 'error' | 'partial' {
  if (hasError) return 'error';
  if (allCompleted) return 'success';
  return 'partial';
}

export class TraceService {
  private traceRepo: TraceRepo;

  constructor(deps: TraceServiceDeps) {
    this.traceRepo = deps.traceRepo;
  }

  /** List traces with filtering and pagination. */
  async listTraces(filters: TraceListFilters): Promise<Result<TraceListResult>> {
    const { rows, total } = await this.traceRepo.listTraces(filters);

    return {
      data: {
        traces: rows.map((r) => ({
          traceId: r.trace_id,
          rootSpanName: r.root_span_name,
          rootSpanType: r.root_span_type,
          rootEntityType: r.root_entity_type,
          rootEntityName: r.root_entity_name,
          threadId: r.thread_id,
          serviceName: r.service_name,
          status: r.status,
          spanCount: r.span_count,
          durationMs: r.duration_ms !== null && r.duration_ms !== undefined ? Math.round(r.duration_ms) : null,
          startedAt: r.started_at,
          endedAt: r.ended_at,
        })),
        total,
        page: filters.page,
        perPage: filters.perPage,
        hasMore: (filters.page + 1) * filters.perPage < total,
      },
    };
  }

  /** Get full trace detail with span tree and summary. */
  async getDetail(traceId: string): Promise<Result<TraceDetailResult>> {
    const rows = await this.traceRepo.getSpansByTraceId(traceId);

    if (rows.length === 0) {
      return { error: 'Trace not found' };
    }

    const spans = rows.map((r: SpanRow) => {
      const startMs = new Date(r.started_at).getTime();
      const endMs = r.ended_at ? new Date(r.ended_at).getTime() : null;
      return {
        id: r.id,
        spanId: r.span_id,
        parentSpanId: r.parent_span_id,
        name: r.name,
        spanType: r.span_type,
        startedAt: r.started_at,
        endedAt: r.ended_at,
        durationMs: endMs !== null ? endMs - startMs : null,
        attributes: r.attributes,
        input: r.input,
        output: r.output,
        error: r.error,
        entityType: r.entity_type,
        entityName: r.entity_name,
        threadId: r.thread_id,
        serviceName: r.service_name,
        promptTokens: extractTokens(r.attributes, 'usage.inputTokens', 'gen_ai.usage.prompt_tokens'),
        completionTokens: extractTokens(r.attributes, 'usage.outputTokens', 'gen_ai.usage.completion_tokens'),
      };
    });

    const hasError = spans.some((s) => s.error !== null && s.error !== undefined);
    const allCompleted = spans.every(
      (s) => (s.endedAt !== null && s.endedAt !== undefined) || s.spanType === 'model_chunk',
    );
    const rootSpan = spans.find((s) => s.parentSpanId === null || s.parentSpanId === undefined) ?? spans[0];
    const minStart = Math.min(...spans.map((s) => new Date(s.startedAt).getTime()));
    const endTimes = spans.filter((s) => s.endedAt).map((s) => new Date(s.endedAt as string).getTime());
    const maxEnd = endTimes.length > 0 ? Math.max(...endTimes) : null;

    return {
      data: {
        traceId,
        spans,
        summary: {
          status: deriveStatus(hasError, allCompleted),
          spanCount: spans.length,
          durationMs: maxEnd !== null ? maxEnd - minStart : null,
          rootSpanName: rootSpan.name,
          threadId: rootSpan.threadId,
          startedAt: new Date(minStart).toISOString(),
          endedAt: maxEnd !== null ? new Date(maxEnd).toISOString() : null,
        },
      },
    };
  }
}
