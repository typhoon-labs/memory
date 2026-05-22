import type { ToolExecutionContext } from '@mastra/core/tools';

/**
 * Live progress update payload emitted from inside a tool execute. The
 * client matches `toolCallId` against open tool pills and renders `message`
 * as a sub-line under that pill (see `packages/chat/.../task-progress.tsx`).
 */
export interface ToolProgressData {
  toolCallId: string;
  message: string;
  status?: 'in-progress' | 'done' | 'failed';
}

/**
 * Emit a transient `data-tool-progress` chunk on the active tool stream.
 *
 * Mastra's `context.writer.custom()` writes a chunk into the live UI message
 * stream; AI SDK v6 surfaces it on the client as a `data-tool-progress` part.
 * These are persisted so progress lines survive page refreshes.
 *
 * No-ops gracefully when called outside an agent tool context (e.g. during
 * unit tests or workflow execution where `context.agent` is unset).
 */
export async function emitToolProgress(
  context: ToolExecutionContext | undefined,
  message: string,
  status: 'in-progress' | 'done' | 'failed' = 'in-progress',
): Promise<void> {
  const toolCallId = context?.agent?.toolCallId;
  const writer = context?.writer;
  if (!toolCallId || !writer) return;
  await writer.custom({
    type: 'data-tool-progress',
    data: { toolCallId, message, status } satisfies ToolProgressData,
    transient: false,
  });
}

/**
 * Emit the generated thread title as a dedicated `data-thread-title` stream
 * part so the client can update the sidebar immediately — before the tool
 * part transitions to `output-available`.
 */
export async function emitThreadTitle(context: ToolExecutionContext | undefined, title: string): Promise<void> {
  const writer = context?.writer;
  if (!writer) return;
  await writer.custom({ type: 'data-thread-title', data: { title }, transient: false });
}

/**
 * Wrap a Mastra tool with start/done progress events. Useful for tools
 * created via `@mastra/rag` helpers (`createVectorQueryTool`,
 * `createGraphRAGTool`) where we don't own the `execute` body and can't add
 * progress emission inline.
 *
 * The returned tool keeps the original id, description, and schemas; only
 * `execute` is replaced with a thin wrapper that emits the start message,
 * runs the underlying tool, and (if `done` is provided) emits a finish
 * message derived from the result.
 */
export function withProgress<
  // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- rag tool types are not portable across @mastra/rag boundaries
  TTool extends { execute?: (input: any, context: any) => Promise<any> },
>(
  inner: TTool,
  labels: {
    start: string;
    // oxlint-disable-next-line @typescript-eslint/no-explicit-any -- result shape varies per tool; callers do their own narrowing
    done?: (output: any) => string;
  },
): TTool {
  if (typeof inner.execute !== 'function') return inner;
  const original = inner.execute.bind(inner);
  return {
    ...inner,
    execute: async (input, context) => {
      await emitToolProgress(context as ToolExecutionContext, labels.start, 'in-progress');
      try {
        const output = await original(input, context);
        if (labels.done) {
          await emitToolProgress(context as ToolExecutionContext, labels.done(output), 'done');
        }
        return output;
      } catch (error) {
        await emitToolProgress(
          context as ToolExecutionContext,
          error instanceof Error ? error.message : 'Tool execution failed',
          'failed',
        );
        throw error;
      }
    },
  };
}
