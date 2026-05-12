import type { ChatStatus, UIMessage } from 'ai';
import { useEffect, useRef, useState } from 'react';

const STALL_TIMEOUT_MS = 15_000;
const CHECK_INTERVAL_MS = 5_000;

/**
 * Detects when an AI SDK chat stream has stalled (no new data for 15s)
 * and auto-aborts it. Returns a stall error that can be displayed in the UI.
 *
 * The AI SDK's `useChat` hangs forever when the server dies mid-stream —
 * `reader.read()` blocks indefinitely, `status` stays "streaming", and
 * `error` is never set. This hook works around that by monitoring message
 * updates and calling `stop()` when the stream appears dead.
 */
export function useStreamStallDetection({
  messages,
  status,
  stop,
}: {
  messages: UIMessage[];
  status: ChatStatus;
  stop: () => void;
}): Error | null {
  const lastActivityRef = useRef(Date.now());
  const [stallError, setStallError] = useState<Error | null>(null);

  // Reset activity on any message change or status transition
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
      if (Date.now() - lastActivityRef.current > STALL_TIMEOUT_MS) {
        stop();
        setStallError(new Error('Connection lost — the response was interrupted.'));
        clearInterval(interval);
      }
    }, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [status, stop]);

  return stallError;
}
