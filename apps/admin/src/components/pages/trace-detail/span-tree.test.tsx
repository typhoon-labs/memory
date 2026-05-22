import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Span, SpanNode } from './shared';
import { SpanTree } from './span-tree';

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    id: 'id-1',
    spanId: 'span-1',
    parentSpanId: null,
    name: 'test-span',
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

function makeNode(spanOverrides: Partial<Span> = {}, children: SpanNode[] = [], depth = 0): SpanNode {
  return {
    span: makeSpan(spanOverrides),
    children,
    depth,
  };
}

describe('SpanTree', () => {
  it('renders span names for root nodes', () => {
    const roots: SpanNode[] = [
      makeNode({ spanId: 's-1', name: 'Agent Run' }),
      makeNode({ spanId: 's-2', name: 'Tool Call' }),
    ];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={2000}
        nameFilter=""
        typeFilter={null}
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.getByText('Agent Run')).toBeTruthy();
    expect(screen.getByText('Tool Call')).toBeTruthy();
  });

  it('renders header with Span and Timeline labels', () => {
    render(
      <SpanTree
        roots={[]}
        traceStartMs={0}
        traceDurationMs={1000}
        nameFilter=""
        typeFilter={null}
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.getByText('Span')).toBeTruthy();
    expect(screen.getByText('Timeline')).toBeTruthy();
  });

  it('renders child spans when parent is expanded by default (depth < 2)', () => {
    const child = makeNode({ spanId: 's-child', name: 'Child Span' }, [], 1);
    const roots: SpanNode[] = [makeNode({ spanId: 's-root', name: 'Root Span' }, [child], 0)];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={2000}
        nameFilter=""
        typeFilter={null}
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.getByText('Root Span')).toBeTruthy();
    expect(screen.getByText('Child Span')).toBeTruthy();
  });

  it('shows duration for spans', () => {
    const roots: SpanNode[] = [makeNode({ spanId: 's-1', name: 'Fast Span', durationMs: 42 })];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={1000}
        nameFilter=""
        typeFilter={null}
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.getByText('42ms')).toBeTruthy();
  });

  it('shows "No matching spans" when filters produce no results', () => {
    const roots: SpanNode[] = [makeNode({ spanId: 's-1', name: 'Agent Run' })];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={1000}
        nameFilter="nonexistent"
        typeFilter={null}
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.getByText('No matching spans')).toBeTruthy();
  });

  it('filters spans by name', () => {
    const roots: SpanNode[] = [
      makeNode({ spanId: 's-1', name: 'Agent Run' }),
      makeNode({ spanId: 's-2', name: 'Tool Call' }),
    ];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={2000}
        nameFilter="tool"
        typeFilter={null}
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.queryByText('Agent Run')).toBeNull();
    expect(screen.getByText('Tool Call')).toBeTruthy();
  });

  it('renders error icon for spans with errors', () => {
    const roots: SpanNode[] = [
      makeNode({
        spanId: 's-1',
        name: 'Failing Span',
        error: { message: 'Something went wrong' },
      }),
    ];

    const { container } = render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={1000}
        nameFilter=""
        typeFilter={null}
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.getByText('Failing Span')).toBeTruthy();
    // Error icon (AlertCircleIcon) renders an SVG with lucide classes
    expect(container.querySelector('.text-red-400')).toBeTruthy();
  });

  it('filters spans by type category', () => {
    const roots: SpanNode[] = [
      makeNode({ spanId: 's-1', name: 'Agent Run', spanType: 'agent_run' }),
      makeNode({ spanId: 's-2', name: 'Tool Call', spanType: 'tool_call' }),
    ];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={2000}
        nameFilter=""
        typeFilter="tool"
        onSelectSpan={vi.fn()}
      />,
    );

    expect(screen.queryByText('Agent Run')).toBeNull();
    expect(screen.getByText('Tool Call')).toBeTruthy();
  });

  it('calls onSelectSpan when span name is clicked', async () => {
    const onSelectSpan = vi.fn();
    const roots: SpanNode[] = [makeNode({ spanId: 's-1', name: 'Clickable Span' })];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={1000}
        nameFilter=""
        typeFilter={null}
        onSelectSpan={onSelectSpan}
      />,
    );

    const spanButton = screen.getByText('Clickable Span');
    spanButton.click();

    expect(onSelectSpan).toHaveBeenCalledTimes(1);
    expect(onSelectSpan).toHaveBeenCalledWith(expect.objectContaining({ spanId: 's-1', name: 'Clickable Span' }));
  });

  it('applies both name and type filters simultaneously', () => {
    const roots: SpanNode[] = [
      makeNode({ spanId: 's-1', name: 'Agent Run', spanType: 'agent_run' }),
      makeNode({ spanId: 's-2', name: 'Agent Tool', spanType: 'tool_call' }),
      makeNode({ spanId: 's-3', name: 'Model Gen', spanType: 'model_generation' }),
    ];

    render(
      <SpanTree
        roots={roots}
        traceStartMs={0}
        traceDurationMs={3000}
        nameFilter="agent"
        typeFilter="tool"
        onSelectSpan={vi.fn()}
      />,
    );

    // Only "Agent Tool" matches both name=agent and type=tool
    expect(screen.queryByText('Agent Run')).toBeNull();
    expect(screen.getByText('Agent Tool')).toBeTruthy();
    expect(screen.queryByText('Model Gen')).toBeNull();
  });
});
