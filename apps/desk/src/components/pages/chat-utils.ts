import type { UIMessage } from 'ai';

/**
 * Scan message parts for a `setThreadTitle` tool output and extract the title.
 *
 * Looks for parts with `type === 'tool-setThreadTitle'` or
 * `toolName === 'setThreadTitle'` (dynamic-tool) where
 * `state === 'output-available'`, then returns the `output.title` string.
 *
 * Returns `null` if no title is found.
 */
export function extractTitleFromMessages(messages: UIMessage[]): string | null {
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      // Fast path: dedicated stream part emitted as soon as the title is generated,
      // before the tool part transitions to 'output-available'.
      if (p.type === 'data-thread-title') {
        const title = (p as { data?: { title?: string } }).data?.title;
        if (title) return title;
      }

      // Fallback: tool output state (for messages loaded from server/history)
      const isMatch =
        (p.type === 'tool-setThreadTitle' ||
          ((p as { type: string; toolName?: string }).toolName === 'setThreadTitle' && p.type === 'dynamic-tool')) &&
        (p as { state?: string }).state === 'output-available';
      if (!isMatch) continue;

      const title = (p as { output?: { title?: string } }).output?.title;
      if (title) return title;
    }
  }
  return null;
}

type ChatStatus = 'streaming' | 'submitted' | 'ready' | 'error';

/**
 * Determine whether the Chat instance should be seeded with server messages.
 *
 * Returns `true` only when:
 * - The chat currently has no messages (`chatMsgCount === 0`)
 * - Server messages are available (`serverMessages.length > 0`)
 * - The chat is not actively streaming or submitted
 * - The thread has not already been seeded
 */
export function shouldSeedMessages(
  chatMsgCount: number,
  serverMessages: UIMessage[],
  chatStatus: ChatStatus,
  alreadySeeded: boolean,
): boolean {
  if (alreadySeeded) return false;
  if (chatMsgCount > 0) return false;
  if (chatStatus === 'streaming' || chatStatus === 'submitted') return false;
  if (serverMessages.length === 0) return false;
  return true;
}
