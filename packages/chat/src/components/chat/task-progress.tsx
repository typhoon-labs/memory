import { type ProgressEvent, type ProgressStep, ProgressTracker } from '@typhoon/ui';
import { useEffect, useMemo, useState } from 'react';

import { stripMarkdown } from '../../lib/utils';
import { resolveToolStatus } from './tool-labels';

const ACTIVITY_TIMEOUT_MS = 60_000;

// =============================================================================
// Types
// =============================================================================

export interface ToolPart {
  type: string;
  toolName?: string;
  toolCallId?: string;
  state?: string;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Derive the step-level status from the tool part state, its persisted
 * progress events, and whether the step is still considered active.
 *
 * After a page refresh, `normalizeToolPart` maps all completed Mastra v4
 * invocations (`state: 'result'`) to `'output-available'` — losing the error
 * distinction. The persisted `data-tool-progress` events still carry the
 * authoritative `'failed'` status, so we consult them as a fallback when the
 * tool part claims success.
 *
 * `isActive` should be `false` when the stream has ended or an inactivity
 * timeout has fired — any non-terminal tool state at that point will never
 * receive an update, so we surface it as a failure rather than spinning
 * forever.
 */
export function resolveStepStatus(state: string, events?: ProgressEvent[], isActive = true): ProgressStep['status'] {
  if (state === 'output-error') return 'failed';
  if (state === 'output-available') {
    if (events?.some((e) => e.status === 'failed')) return 'failed';
    return 'completed';
  }
  // Tool finished but AI SDK hasn't flushed 'output-available' yet —
  // trust the tool's own progress events for early status resolution.
  if (events?.length) {
    if (events.some((e) => e.status === 'failed')) return 'failed';
    if (events.some((e) => e.status === 'done')) return 'completed';
  }
  return isActive ? 'in-progress' : 'failed';
}

// =============================================================================
// Component
// =============================================================================

export function TaskProgress({
  toolParts,
  messageId,
  progressByCallId,
  isStreaming = true,
}: {
  toolParts: ToolPart[];
  messageId: string;
  /**
   * Live transient sub-progress events grouped by `toolCallId`. Sourced from
   * `data-tool-progress` UIMessage parts emitted via Mastra's
   * `context.writer.custom()` from inside tool execute functions.
   */
  progressByCallId?: Map<string, ProgressEvent[]>;
  /** Whether the parent message is still being actively streamed. */
  isStreaming?: boolean;
}) {
  const [isStale, setIsStale] = useState(false);

  // Fingerprint: changes whenever tool states or progress events update.
  const fingerprint = useMemo(() => {
    const states = toolParts.map((p) => `${p.toolCallId ?? ''}:${p.state ?? ''}`).join('|');
    const events = progressByCallId
      ? [...progressByCallId.entries()].map(([k, v]) => `${k}:${String(v.length)}`).join('|')
      : '';
    return `${states}::${events}`;
  }, [toolParts, progressByCallId]);

  // Whether any tool part is still in a non-terminal state.
  const hasNonTerminal = useMemo(
    () =>
      toolParts.some((p) => {
        const s = p.state ?? 'input-available';
        return s !== 'output-available' && s !== 'output-error';
      }),
    [toolParts],
  );

  // Reset stale flag on activity; start an inactivity timer while streaming.
  useEffect(() => {
    setIsStale(false);
    if (!hasNonTerminal || !isStreaming) return;

    const timer = setTimeout(() => setIsStale(true), ACTIVITY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [fingerprint, hasNonTerminal, isStreaming]);

  if (toolParts.length === 0) return null;

  // Steps are active (show spinner) only while streaming and not stale.
  const isActive = isStreaming && !isStale;

  const steps: ProgressStep[] = toolParts.map((part, i) => {
    const toolName = part.toolName ?? part.type.replace(/^tool-/, '');
    const state = part.state ?? 'input-available';
    const events = part.toolCallId ? progressByCallId?.get(part.toolCallId) : undefined;

    return {
      id: `${messageId}-step-${String(i)}`,
      label: stripMarkdown(resolveToolStatus(toolName)),
      status: resolveStepStatus(state, events, isActive),
      progressEvents: events && events.length > 0 ? events : undefined,
    };
  });

  return <ProgressTracker id={`activity-${messageId}`} steps={steps} />;
}
