import { handleChatStream } from '@mastra/ai-sdk';
import { registerApiRoute } from '@mastra/core/server';
import { createAppLogger } from '@typhoon/logger';
import { conversationStarted, getActiveTraceId } from '@typhoon/telemetry';
import { createUIMessageStreamResponse } from 'ai';
import type { Queue } from 'bullmq';

import { requireAuth } from '../middleware/require-auth';
import { getChatService } from '../services';

const log = createAppLogger('chat');

// Module-level queue wiring — sets the queue on the ChatService
export function setReviewsQueue(queue: Queue) {
  getChatService().setReviewsQueue(queue);
}

const streamLoggingHooks = {
  onChunk: (chunk: unknown) => {
    log.debug('Stream chunk', { type: (chunk as Record<string, unknown>).type });
  },
  onStepFinish: ({ text, finishReason, usage }: { text?: string; finishReason?: unknown; usage?: unknown }) => {
    log.debug('Step finished', { finishReason, textLength: text?.length, usage });
  },
  onFinish: ({
    text,
    finishReason,
    usage,
    steps,
  }: {
    text?: string;
    finishReason?: unknown;
    usage?: unknown;
    steps?: unknown[];
  }) => {
    log.debug('Stream complete', {
      finishReason,
      textLength: text?.length,
      steps: steps?.length,
      usage,
    });
  },
  onError: (error: unknown) => {
    log.error('Stream error', { error });
  },
  onAbort: () => {
    log.debug('Stream aborted');
  },
};

export const chatRoutes = [
  registerApiRoute('/v1/chat/:agentId', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const params = await c.req.json();
      const mastra = c.get('mastra');
      const requestContext = c.get('requestContext');
      const agentId = c.req.param('agentId');

      if (!agentId) {
        return c.json({ error: 'Agent ID is required' }, 400);
      }

      conversationStarted.add(1, { agent: agentId });

      // Capture OTel traceId eagerly — the span may be closed by onFinish time
      const traceId = getActiveTraceId();
      const threadId: string | undefined = params.memory?.thread;

      const chatService = getChatService();

      const hooks = {
        ...streamLoggingHooks,
        onFinish: (event: { text?: string; finishReason?: unknown; usage?: unknown; steps?: unknown[] }) => {
          streamLoggingHooks.onFinish(event);
          chatService.enqueueScoringJob({ threadId, agentId, traceId });
        },
      };

      const uiMessageStream = await handleChatStream({
        mastra,
        agentId,
        version: 'v6',
        sendSources: true,
        sendReasoning: false,
        params: {
          ...params,
          requestContext,
          abortSignal: c.req.raw.signal,
        },
        defaultOptions: hooks,
      });

      return createUIMessageStreamResponse({ stream: uiMessageStream });
    },
  }),
];
