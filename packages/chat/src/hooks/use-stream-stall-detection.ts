import type { ChatStatus, UIMessage } from 'ai';
import { useCallback, useEffect, useRef, useState } from 'react';

const STALL_TIMEOUT_MS = 15_000;
const TOOL_STALL_TIMEOUT_MS = 60_000;
const CHECK_INTERVAL_MS = 5_000;

const TERMINAL_TOOL_STATES = new Set(['output-available', 'output-error', 'output-denied']);

/** Whether the last assistant message has a tool invocation still executing. */
function hasPendingToolCall(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (!last || last.role !== 'assistant') return false;
  return last.parts.some(
    (p) => p.type.startsWith('tool-') && !TERMINAL_TOOL_STATES.has((p as { state?: string }).state ?? ''),
  );
}

/**
 * Detects when an AI SDK chat stream has stalled and auto-aborts it.
 * Returns a stall error and a function to clear it.
 *
 * The AI SDK's `useChat` hangs forever when the server dies mid-stream —
 * `reader.read()` blocks indefinitely, `status` stays "streaming", and
 * `error` is never set. This hook works around that by monitoring message
 * updates and calling `stop()` when the stream appears dead.
 *
 * When a tool call is in progress (e.g. knowledge search), the timeout is
 * extended to 60s since tool execution legitimately takes longer than text
 * streaming. When no tool call is pending, the 15s timeout applies.
 */
export function useStreamStallDetection({
  messages,
  status,
  stop,
}: {
  messages: UIMessage[];
  status: ChatStatus;
  stop: () => void;
}): { stallError: Error | null; clearStallError: () => void } {
  const lastActivityRef = useRef(Date.now());
  const [stallError, setStallError] = useState<Error | null>(null);

  const clearStallError = useCallback(() => setStallError(null), []);

  // Keep a ref to messages so the polling interval can read current values
  // without restarting the interval on every message change.
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  // Reset activity on any message change
  const messagesLengthRef = useRef(messages.length);
  const lastContentRef = useRef('');
  useEffect(() => {
    const currentContent = messages.at(-1)?.parts?.length?.toString() ?? '';
    if (messages.length !== messagesLengthRef.current || currentContent !== lastContentRef.current) {
      messagesLengthRef.current = messages.length;
      lastContentRef.current = currentContent;
      lastActivityRef.current = Date.now();
    }
  }, [messages]);

  // Clear stall error when a new request starts
  useEffect(() => {
    if (status === 'submitted') {
      setStallError(null);
      lastActivityRef.current = Date.now();
    }
  }, [status]);

  // Poll for stalls while streaming
  useEffect(() => {
    if (status !== 'streaming' && status !== 'submitted') return;

    const interval = setInterval(() => {
      const timeout = hasPendingToolCall(messagesRef.current) ? TOOL_STALL_TIMEOUT_MS : STALL_TIMEOUT_MS;

      if (Date.now() - lastActivityRef.current > timeout) {
        stop();
        setStallError(new Error('Connection lost — the response was interrupted.'));
        clearInterval(interval);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status, stop]);

  return { stallError, clearStallError };
}
