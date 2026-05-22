import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ToolPart } from './task-progress';
import { resolveStepStatus, TaskProgress } from './task-progress';

// ---------------------------------------------------------------------------
// Mock ProgressTracker from @typhoon/ui to inspect the steps prop
// ---------------------------------------------------------------------------

vi.mock('@typhoon/ui', () => ({
  ProgressTracker: ({ steps }: { steps: Array<{ id: string; label: string; status: string }> }) => (
    <div data-testid="progress-tracker">
      {steps.map((step) => (
        <div key={step.id} data-testid={`step-${step.id}`} data-status={step.status}>
          {step.label}
        </div>
      ))}
    </div>
  ),
}));

vi.mock('./tool-labels', () => ({
  resolveToolStatus: (name: string) => `Using ${name}`,
}));

vi.mock('../../lib/utils', () => ({
  stripMarkdown: (text: string) => text,
}));

afterEach(cleanup);

// ---------------------------------------------------------------------------
// resolveStepStatus unit tests
// ---------------------------------------------------------------------------

describe('resolveStepStatus', () => {
  it('returns "failed" for output-error state', () => {
    expect(resolveStepStatus('output-error')).toBe('failed');
  });

  it('returns "completed" for output-available state', () => {
    expect(resolveStepStatus('output-available')).toBe('completed');
  });

  it('returns "failed" for output-available when events contain failed', () => {
    const events = [{ message: 'step failed', status: 'failed' as const }];
    expect(resolveStepStatus('output-available', events)).toBe('failed');
  });

  it('returns "in-progress" for non-terminal state when active', () => {
    expect(resolveStepStatus('input-available', undefined, true)).toBe('in-progress');
  });

  it('returns "failed" for non-terminal state when inactive', () => {
    expect(resolveStepStatus('input-available', undefined, false)).toBe('failed');
  });

  it('returns "completed" for non-terminal state when progress events include done', () => {
    const events = [{ message: 'Naming conversation…' }, { message: 'My Title', status: 'done' as const }];
    expect(resolveStepStatus('input-available', events, true)).toBe('completed');
  });

  it('returns "failed" for non-terminal state when progress events include failed', () => {
    const events = [{ message: 'Something broke', status: 'failed' as const }];
    expect(resolveStepStatus('input-available', events, true)).toBe('failed');
  });

  it('returns "in-progress" for non-terminal state with no progress events', () => {
    expect(resolveStepStatus('input-available', [], true)).toBe('in-progress');
  });
});

// ---------------------------------------------------------------------------
// TaskProgress component tests
// ---------------------------------------------------------------------------

describe('TaskProgress', () => {
  it('returns null when toolParts is empty', () => {
    const { container } = render(<TaskProgress toolParts={[]} messageId="msg-1" isStreaming={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a single tool call step', () => {
    const toolParts: ToolPart[] = [
      { type: 'tool-invocation', toolName: 'searchKnowledgeBase', toolCallId: 'tc-1', state: 'output-available' },
    ];

    render(<TaskProgress toolParts={toolParts} messageId="msg-1" isStreaming={false} />);

    expect(screen.getByTestId('progress-tracker')).toBeTruthy();
    expect(screen.getByText('Using searchKnowledgeBase')).toBeTruthy();
  });

  it('renders multiple tool call steps', () => {
    const toolParts: ToolPart[] = [
      { type: 'tool-invocation', toolName: 'searchKnowledgeBase', toolCallId: 'tc-1', state: 'output-available' },
      { type: 'tool-invocation', toolName: 'searchKnowledgeBaseGraph', toolCallId: 'tc-2', state: 'output-available' },
    ];

    render(<TaskProgress toolParts={toolParts} messageId="msg-1" isStreaming={false} />);

    expect(screen.getByText('Using searchKnowledgeBase')).toBeTruthy();
    expect(screen.getByText('Using searchKnowledgeBaseGraph')).toBeTruthy();
  });

  it('marks completed steps with completed status', () => {
    const toolParts: ToolPart[] = [
      { type: 'tool-invocation', toolName: 'searchKnowledgeBase', toolCallId: 'tc-1', state: 'output-available' },
    ];

    render(<TaskProgress toolParts={toolParts} messageId="msg-1" isStreaming={false} />);

    const step = screen.getByTestId('step-msg-1-step-0');
    expect(step.getAttribute('data-status')).toBe('completed');
  });

  it('marks errored steps with failed status', () => {
    const toolParts: ToolPart[] = [
      { type: 'tool-invocation', toolName: 'searchKnowledgeBase', toolCallId: 'tc-1', state: 'output-error' },
    ];

    render(<TaskProgress toolParts={toolParts} messageId="msg-1" isStreaming={false} />);

    const step = screen.getByTestId('step-msg-1-step-0');
    expect(step.getAttribute('data-status')).toBe('failed');
  });

  it('marks in-progress steps when streaming', () => {
    const toolParts: ToolPart[] = [
      { type: 'tool-invocation', toolName: 'searchKnowledgeBase', toolCallId: 'tc-1', state: 'input-available' },
    ];

    render(<TaskProgress toolParts={toolParts} messageId="msg-1" isStreaming />);

    const step = screen.getByTestId('step-msg-1-step-0');
    expect(step.getAttribute('data-status')).toBe('in-progress');
  });

  it('marks non-terminal steps as failed when not streaming', () => {
    const toolParts: ToolPart[] = [
      { type: 'tool-invocation', toolName: 'searchKnowledgeBase', toolCallId: 'tc-1', state: 'input-available' },
    ];

    render(<TaskProgress toolParts={toolParts} messageId="msg-1" isStreaming={false} />);

    const step = screen.getByTestId('step-msg-1-step-0');
    expect(step.getAttribute('data-status')).toBe('failed');
  });

  it('passes progress events to the step when available', () => {
    const toolParts: ToolPart[] = [
      { type: 'tool-invocation', toolName: 'searchKnowledgeBase', toolCallId: 'tc-1', state: 'output-available' },
    ];

    const progressByCallId = new Map([['tc-1', [{ message: 'Searching 3 documents', status: 'done' as const }]]]);

    render(
      <TaskProgress toolParts={toolParts} messageId="msg-1" progressByCallId={progressByCallId} isStreaming={false} />,
    );

    // The component should still render the step (progress events are passed through)
    expect(screen.getByText('Using searchKnowledgeBase')).toBeTruthy();
  });

  it('falls back to type-based tool name when toolName is missing', () => {
    const toolParts: ToolPart[] = [{ type: 'tool-invocation', toolCallId: 'tc-1', state: 'output-available' }];

    render(<TaskProgress toolParts={toolParts} messageId="msg-1" isStreaming={false} />);

    // resolveToolStatus receives 'invocation' (from type minus 'tool-' prefix)
    expect(screen.getByText('Using invocation')).toBeTruthy();
  });
});
