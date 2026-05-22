/** Filter params for listing traces. */
export interface TraceListParams {
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  perPage?: number;
  status?: string;
  entityType?: string;
  spanType?: string;
  minDurationMs?: number;
  maxDurationMs?: number;
  search?: string;
  threadId?: string;
}

/** A single trace in the list. */
export interface Trace {
  traceId: string;
  name: string;
  status: string;
  durationMs: number;
  spanCount: number;
  entityType?: string;
  createdAt: string;
  [key: string]: unknown;
}

/** Paginated trace list response. */
export interface TraceListResponse {
  traces: Trace[];
  total: number;
  page: number;
  perPage: number;
}

/** A span within a trace. */
export interface TraceSpan {
  spanId: string;
  parentSpanId: string | null;
  name: string;
  status: string;
  startTime: string;
  endTime: string;
  durationMs: number;
  attributes: Record<string, unknown>;
  events: Array<{ name: string; timestamp: string; attributes: Record<string, unknown> }>;
}

/** Trace detail response with all spans. */
export interface TraceDetail {
  traceId: string;
  name: string;
  status: string;
  durationMs: number;
  spans: TraceSpan[];
  [key: string]: unknown;
}
