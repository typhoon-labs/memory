import { describe, expect, it } from 'vitest';
import type { Span, SpanNode } from './shared';
import {
  buildSpanTree,
  filterTree,
  formatDurationMs,
  SPAN_CATEGORY_COLORS,
  SPAN_CATEGORY_LABELS,
  spanTypeCategory,
  spanTypeColor,
  spanTypeLabel,
} from './shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    id: '1',
    spanId: 'span-1',
    parentSpanId: null,
    name: 'root',
    spanType: 'agent_run',
    startedAt: '2025-01-01T00:00:00Z',
    endedAt: '2025-01-01T00:00:01Z',
    durationMs: 1000,
    attributes: null,
    input: null,
    output: null,
    error: null,
    entityType: null,
    entityName: null,
    threadId: null,
    serviceName: null,
    promptTokens: null,
    completionTokens: null,
    ...overrides,
  };
}

function makeNode(span: Partial<Span>, children: SpanNode[] = [], depth = 0): SpanNode {
  return { span: makeSpan(span), children, depth };
}

// ---------------------------------------------------------------------------
// formatDurationMs
// ---------------------------------------------------------------------------

describe('formatDurationMs', () => {
  it('returns dash for null', () => {
    expect(formatDurationMs(null)).toBe('\u2014');
  });

  it('returns <1ms for sub-millisecond', () => {
    expect(formatDurationMs(0.5)).toBe('<1ms');
  });

  it('formats milliseconds', () => {
    expect(formatDurationMs(42)).toBe('42ms');
    expect(formatDurationMs(999)).toBe('999ms');
  });

  it('formats seconds', () => {
    expect(formatDurationMs(1500)).toBe('1.5s');
    expect(formatDurationMs(30_000)).toBe('30.0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDurationMs(90_000)).toBe('1m 30s');
    expect(formatDurationMs(60_000)).toBe('1m 0s');
  });
});

// ---------------------------------------------------------------------------
// spanTypeCategory
// ---------------------------------------------------------------------------

describe('spanTypeCategory', () => {
  it('maps agent types', () => {
    expect(spanTypeCategory('agent_run')).toBe('agent');
    expect(spanTypeCategory('agent')).toBe('agent');
  });

  it('maps model types', () => {
    for (const t of ['model_generation', 'model_step', 'model_chunk', 'llm', 'model']) {
      expect(spanTypeCategory(t)).toBe('model');
    }
  });

  it('maps tool types', () => {
    expect(spanTypeCategory('tool_call')).toBe('tool');
    expect(spanTypeCategory('mcp_tool_call')).toBe('tool');
  });

  it('maps scorer types', () => {
    expect(spanTypeCategory('scorer_run')).toBe('scorer');
    expect(spanTypeCategory('scorer_step')).toBe('scorer');
  });

  it('maps workflow types', () => {
    expect(spanTypeCategory('workflow_run')).toBe('workflow');
    expect(spanTypeCategory('workflow_step')).toBe('workflow');
    expect(spanTypeCategory('workflow_conditional')).toBe('workflow');
    expect(spanTypeCategory('workflow_sleep')).toBe('workflow');
  });

  it('maps rag types', () => {
    expect(spanTypeCategory('rag_ingestion')).toBe('rag');
    expect(spanTypeCategory('rag_embedding')).toBe('rag');
    expect(spanTypeCategory('rag_vector_operation')).toBe('rag');
    expect(spanTypeCategory('rag_action')).toBe('rag');
  });

  it('maps memory types', () => {
    expect(spanTypeCategory('memory_operation')).toBe('memory');
  });

  it('falls back to other', () => {
    expect(spanTypeCategory('generic')).toBe('other');
    expect(spanTypeCategory('unknown_thing')).toBe('other');
  });
});

// ---------------------------------------------------------------------------
// SPAN_CATEGORY_LABELS / SPAN_CATEGORY_COLORS
// ---------------------------------------------------------------------------

describe('SPAN_CATEGORY_LABELS', () => {
  it('has an entry for every category', () => {
    for (const cat of ['agent', 'model', 'tool', 'scorer', 'workflow', 'rag', 'memory', 'other']) {
      expect(SPAN_CATEGORY_LABELS[cat]).toBeDefined();
    }
  });
});

describe('SPAN_CATEGORY_COLORS', () => {
  it('has a bg-* class for every category', () => {
    for (const cat of ['agent', 'model', 'tool', 'scorer', 'workflow', 'rag', 'memory', 'other']) {
      expect(SPAN_CATEGORY_COLORS[cat]).toMatch(/^bg-/);
    }
  });
});

// ---------------------------------------------------------------------------
// spanTypeColor / spanTypeLabel
// ---------------------------------------------------------------------------

describe('spanTypeColor', () => {
  it('returns a bg-* class', () => {
    expect(spanTypeColor('agent_run')).toMatch(/^bg-/);
    expect(spanTypeColor('unknown')).toMatch(/^bg-/);
  });
});

describe('spanTypeLabel', () => {
  it('returns human labels for known types', () => {
    expect(spanTypeLabel('agent_run')).toBe('Agent');
    expect(spanTypeLabel('model_generation')).toBe('Model');
    expect(spanTypeLabel('tool_call')).toBe('Tool');
    expect(spanTypeLabel('rag_embedding')).toBe('RAG Embedding');
    expect(spanTypeLabel('memory_operation')).toBe('Memory');
    expect(spanTypeLabel('workflow_sleep')).toBe('Sleep');
  });

  it('falls back to raw type for unknown types', () => {
    expect(spanTypeLabel('custom_thing')).toBe('custom_thing');
  });
});

// ---------------------------------------------------------------------------
// buildSpanTree
// ---------------------------------------------------------------------------

describe('buildSpanTree', () => {
  it('returns empty array for no spans', () => {
    expect(buildSpanTree([])).toEqual([]);
  });

  it('builds a flat list of roots when no parent references', () => {
    const spans = [makeSpan({ spanId: 'a' }), makeSpan({ spanId: 'b' })];
    const tree = buildSpanTree(spans);
    expect(tree).toHaveLength(2);
    expect(tree[0].depth).toBe(0);
    expect(tree[1].depth).toBe(0);
  });

  it('nests children under parents', () => {
    const spans = [
      makeSpan({ spanId: 'root', parentSpanId: null }),
      makeSpan({ spanId: 'child', parentSpanId: 'root' }),
    ];
    const tree = buildSpanTree(spans);
    expect(tree).toHaveLength(1);
    expect(tree[0].span.spanId).toBe('root');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children[0].span.spanId).toBe('child');
  });

  it('sets depth correctly for nested spans', () => {
    const spans = [
      makeSpan({ spanId: 'a', parentSpanId: null }),
      makeSpan({ spanId: 'b', parentSpanId: 'a' }),
      makeSpan({ spanId: 'c', parentSpanId: 'b' }),
    ];
    const tree = buildSpanTree(spans);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it('treats orphaned spans as roots', () => {
    const spans = [makeSpan({ spanId: 'orphan', parentSpanId: 'nonexistent' })];
    const tree = buildSpanTree(spans);
    expect(tree).toHaveLength(1);
    expect(tree[0].depth).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// filterTree
// ---------------------------------------------------------------------------

describe('filterTree', () => {
  const tree: SpanNode[] = [
    makeNode({ spanId: 'root', name: 'Agent Run', spanType: 'agent_run' }, [
      makeNode({ spanId: 'model', name: 'Model Call', spanType: 'model_generation' }, [], 1),
      makeNode(
        { spanId: 'tool-parent', name: 'Tool Wrapper', spanType: 'agent_run' },
        [makeNode({ spanId: 'tool', name: 'Search Tool', spanType: 'tool_call' }, [], 2)],
        1,
      ),
    ]),
  ];

  it('returns full tree when predicate matches everything', () => {
    const result = filterTree(tree, () => true);
    expect(result).toHaveLength(1);
    expect(result[0].children).toHaveLength(2);
  });

  it('returns empty when nothing matches', () => {
    const result = filterTree(tree, () => false);
    expect(result).toHaveLength(0);
  });

  it('preserves ancestors of matching nodes', () => {
    const result = filterTree(tree, (s) => s.name === 'Search Tool');
    expect(result).toHaveLength(1);
    expect(result[0].span.spanId).toBe('root');
    // Only the branch containing the match is kept
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].span.spanId).toBe('tool-parent');
    expect(result[0].children[0].children).toHaveLength(1);
    expect(result[0].children[0].children[0].span.spanId).toBe('tool');
  });

  it('prunes non-matching siblings', () => {
    const result = filterTree(tree, (s) => s.spanType === 'model_generation');
    expect(result).toHaveLength(1);
    // root kept as ancestor, model kept as match, tool branch pruned
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].span.spanId).toBe('model');
  });

  it('does not mutate the original tree', () => {
    filterTree(tree, (s) => s.name === 'Search Tool');
    // Original tree still has both children
    expect(tree[0].children).toHaveLength(2);
  });
});
