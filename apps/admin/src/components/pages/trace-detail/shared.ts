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
      bySpanId.get(node.span.parentSpanId)?.children.push(node);
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
  return SPAN_CATEGORY_COLORS[spanTypeCategory(spanType)] ?? 'bg-zinc-400/60';
}

/** Map raw span type to one of the legend categories. */
export function spanTypeCategory(spanType: string): string {
  if (spanType === 'agent_run' || spanType === 'agent') return 'agent';
  if (
    spanType === 'model_generation' ||
    spanType === 'model_step' ||
    spanType === 'model_chunk' ||
    spanType === 'llm' ||
    spanType === 'model'
  )
    return 'model';
  if (spanType === 'tool_call' || spanType === 'mcp_tool_call') return 'tool';
  if (spanType === 'scorer_run' || spanType === 'scorer_step') return 'scorer';
  if (spanType.startsWith('workflow')) return 'workflow';
  if (spanType.startsWith('rag_')) return 'rag';
  if (spanType === 'memory_operation') return 'memory';
  return 'other';
}

/** Category → human label for filter badges. */
export const SPAN_CATEGORY_LABELS: Record<string, string> = {
  agent: 'Agent',
  model: 'Model',
  tool: 'Tool',
  scorer: 'Scorer',
  workflow: 'Workflow',
  rag: 'RAG',
  memory: 'Memory',
  other: 'Other',
};

/** Category → CSS background color class. */
export const SPAN_CATEGORY_COLORS: Record<string, string> = {
  agent: 'bg-blue-400/60',
  model: 'bg-purple-400/60',
  tool: 'bg-amber-400/60',
  scorer: 'bg-emerald-400/60',
  workflow: 'bg-cyan-400/60',
  rag: 'bg-rose-400/60',
  memory: 'bg-teal-400/60',
  other: 'bg-zinc-400/60',
};

/**
 * Filter a span tree, keeping nodes that match the predicate
 * plus all their ancestors (to preserve tree structure).
 */
export function filterTree(roots: SpanNode[], predicate: (span: Span) => boolean): SpanNode[] {
  function walk(node: SpanNode): SpanNode | null {
    const filteredChildren = node.children.map(walk).filter(Boolean) as SpanNode[];
    if (predicate(node.span) || filteredChildren.length > 0) {
      return { ...node, children: filteredChildren };
    }
    return null;
  }
  return roots.map(walk).filter(Boolean) as SpanNode[];
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
    workflow_conditional: 'Conditional',
    workflow_conditional_eval: 'Condition Eval',
    workflow_parallel: 'Parallel',
    workflow_loop: 'Loop',
    workflow_sleep: 'Sleep',
    workflow_wait_event: 'Wait Event',
    memory_operation: 'Memory',
    workspace_action: 'Workspace',
    rag_ingestion: 'RAG Ingestion',
    rag_embedding: 'RAG Embedding',
    rag_vector_operation: 'Vector Op',
    rag_action: 'RAG Action',
    graph_action: 'Graph',
    generic: 'Generic',
    processor_run: 'Processor',
  };
  return labels[spanType] ?? spanType;
}
