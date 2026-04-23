// ---------- Types ----------

export interface Span {
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
}

export interface TraceSummary {
  status: 'success' | 'error' | 'partial';
  spanCount: number;
  durationMs: number | null;
  rootSpanName: string;
  threadId: string | null;
  startedAt: string;
  endedAt: string | null;
}

export interface TraceDetailResponse {
  traceId: string;
  spans: Span[];
  summary: TraceSummary;
}

export interface SpanNode {
  span: Span;
  children: SpanNode[];
  depth: number;
}

// ---------- Helpers ----------

/** Format milliseconds to human-readable duration. */
export function formatDurationMs(ms: number | null): string {
  if (ms == null) return '\u2014';
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60_000);
  const sec = Math.floor((ms % 60_000) / 1000);
  return `${min}m ${sec}s`;
}

/** Build a tree from a flat span array using parentSpanId relationships. */
export function buildSpanTree(spans: Span[]): SpanNode[] {
  const bySpanId = new Map<string, SpanNode>();
  for (const span of spans) {
    bySpanId.set(span.spanId, { span, children: [], depth: 0 });
  }

  const roots: SpanNode[] = [];
  for (const node of bySpanId.values()) {
    if (node.span.parentSpanId && bySpanId.has(node.span.parentSpanId)) {
      bySpanId.get(node.span.parentSpanId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  function setDepth(node: SpanNode, d: number) {
    node.depth = d;
    for (const child of node.children) {
      setDepth(child, d + 1);
    }
  }
  for (const root of roots) {
    setDepth(root, 0);
  }

  return roots;
}

/** Span type → CSS background color class for waterfall bars. */
export function spanTypeColor(spanType: string): string {
  if (spanType === 'agent_run' || spanType === 'agent') return 'bg-blue-400/60';
  if (
    spanType === 'model_generation' ||
    spanType === 'model_step' ||
    spanType === 'model_chunk' ||
    spanType === 'llm' ||
    spanType === 'model'
  )
    return 'bg-purple-400/60';
  if (spanType === 'tool_call' || spanType === 'mcp_tool_call') return 'bg-amber-400/60';
  if (spanType === 'scorer_run' || spanType === 'scorer_step') return 'bg-emerald-400/60';
  if (spanType.startsWith('workflow')) return 'bg-cyan-400/60';
  return 'bg-zinc-400/60';
}

/** Span type → human label. */
export function spanTypeLabel(spanType: string): string {
  const labels: Record<string, string> = {
    agent_run: 'Agent',
    model_generation: 'Model',
    model_step: 'Model Step',
    model_chunk: 'Stream Chunk',
    tool_call: 'Tool',
    mcp_tool_call: 'MCP Tool',
    scorer_run: 'Scorer',
    scorer_step: 'Scorer Step',
    workflow_run: 'Workflow',
    workflow_step: 'Workflow Step',
    generic: 'Generic',
    processor_run: 'Processor',
  };
  return labels[spanType] ?? spanType;
}
