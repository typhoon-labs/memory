import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-router', () => ({
  Link: ({ children, to }: Record<string, unknown>) => <a href={to as string}>{children as React.ReactNode}</a>,
}));

import type { Span } from './shared';
import { SpanDetailSheet } from './span-detail-sheet';

beforeEach(() => vi.clearAllMocks());

function makeSpan(overrides: Partial<Span> = {}): Span {
  return {
    id: 'id-1',
    spanId: 'span-abc',
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

describe('SpanDetailSheet', () => {
  it('renders span name and details when open', () => {
    const span = makeSpan({ name: 'My Agent Span', spanType: 'agent_run' });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('My Agent Span')).toBeTruthy();
    expect(screen.getByText('Agent')).toBeTruthy();
    expect(screen.getByText('completed')).toBeTruthy();
  });

  it('renders timing section', () => {
    const span = makeSpan({ durationMs: 1500 });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Timing')).toBeTruthy();
    expect(screen.getByText('Duration')).toBeTruthy();
    expect(screen.getByText('1.5s')).toBeTruthy();
  });

  it('renders token counts when present', () => {
    const span = makeSpan({ promptTokens: 500, completionTokens: 200 });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Tokens')).toBeTruthy();
    expect(screen.getByText('Prompt')).toBeTruthy();
    expect(screen.getByText('500')).toBeTruthy();
    expect(screen.getByText('Completion')).toBeTruthy();
    expect(screen.getByText('200')).toBeTruthy();
  });

  it('does not render tokens section when no tokens', () => {
    const span = makeSpan({ promptTokens: null, completionTokens: null });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.queryByText('Tokens')).toBeNull();
  });

  it('renders entity section when entity fields present', () => {
    const span = makeSpan({
      entityType: 'AGENT',
      entityName: 'knowledge-agent',
      serviceName: 'api',
    });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Entity')).toBeTruthy();
    expect(screen.getByText('AGENT')).toBeTruthy();
    expect(screen.getByText('knowledge-agent')).toBeTruthy();
    expect(screen.getByText('api')).toBeTruthy();
  });

  it('renders error section when span has error', () => {
    const span = makeSpan({
      error: { message: 'Connection timeout', name: 'TimeoutError' },
    });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Error')).toBeTruthy();
    expect(screen.getByText('TimeoutError')).toBeTruthy();
    expect(screen.getByText('Connection timeout')).toBeTruthy();
    expect(screen.getByText('error')).toBeTruthy();
  });

  it('renders identifiers section with span ID', () => {
    const span = makeSpan({ spanId: 'span-xyz-123', parentSpanId: 'span-parent-456' });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Identifiers')).toBeTruthy();
    expect(screen.getByText('span-xyz-123')).toBeTruthy();
    expect(screen.getByText('span-parent-456')).toBeTruthy();
  });

  it('renders thread link when threadId is present', () => {
    const span = makeSpan({ threadId: 'thread-abc' });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Conversation')).toBeTruthy();
    expect(screen.getByText('View Review')).toBeTruthy();
  });

  it('returns null when span is null', () => {
    const { container } = render(<SpanDetailSheet span={null} open={true} onOpenChange={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('does not show content when open is false', () => {
    const span = makeSpan({ name: 'Hidden Span' });
    render(<SpanDetailSheet span={span} open={false} onOpenChange={vi.fn()} />);

    // Sheet with open=false should not render visible content
    expect(screen.queryByText('Hidden Span')).toBeNull();
  });

  it('renders input/output sections when present', () => {
    const span = makeSpan({ input: { query: 'hello' }, output: { result: 'world' } });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('Input')).toBeTruthy();
    expect(screen.getByText('Output')).toBeTruthy();
  });

  it('renders running status for span without endedAt', () => {
    const span = makeSpan({ endedAt: null, error: null });
    render(<SpanDetailSheet span={span} open={true} onOpenChange={vi.fn()} />);

    expect(screen.getByText('running')).toBeTruthy();
  });
});
