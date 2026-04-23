import { handleChatStream } from '@mastra/ai-sdk';
import { registerApiRoute } from '@mastra/core/server';
import { isScoringEnabled } from '@typhoon/config';
import type { ScoringJobData } from '@typhoon/ingestion';
import { createAppLogger } from '@typhoon/logger';
import { conversationStarted, getActiveTraceId } from '@typhoon/telemetry';
import { createUIMessageStreamResponse } from 'ai';
import type { Queue } from 'bullmq';
import { requireAuth } from '../middleware/require-auth';

const log = createAppLogger('chat');

// Module-level queue reference, wired by API bootstrap (see index.ts)
let _scoringQueue: Queue | null = null;
export function setScoringQueue(queue: Queue) {
  _scoringQueue = queue;
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

      const scoringEnabled = isScoringEnabled() && _scoringQueue !== null;
      const sampleRate = Number(process.env.SCORING_SAMPLE_RATE ?? '1.0');
      const shouldScore = scoringEnabled && !!threadId && Math.random() < sampleRate;

      const hooks = {
        ...streamLoggingHooks,
        onFinish: (event: { text?: string; finishReason?: unknown; usage?: unknown; steps?: unknown[] }) => {
          streamLoggingHooks.onFinish(event);
          enqueueScoringJob({ shouldScore, threadId, agentId, traceId });
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

/**
 * Enqueue a scoring job for the latest assistant message in the thread.
 * Fire-and-forget — never blocks the response.
 */
function enqueueScoringJob(opts: {
  shouldScore: boolean;
  threadId: string | undefined;
  agentId: string;
  traceId: string | null;
}) {
  if (!opts.shouldScore || !opts.threadId || !_scoringQueue) return;

  // Use threadId + timestamp as a dedup key since we don't have the messageId yet.
  // The scoring worker resolves the actual latest assistant message in the thread.
  const jobId = `score-${opts.threadId}-${Date.now()}`;

  _scoringQueue
    .add(
      'score-message',
      {
        messageId: '', // resolved by the worker from the thread
        threadId: opts.threadId,
        agentId: opts.agentId,
        traceId: opts.traceId,
      } satisfies ScoringJobData,
      {
        jobId,
        delay: 3000, // 3s delay for Mastra to finish persisting the message
      },
    )
    .catch((err) => {
      log.error('Failed to enqueue scoring job', { error: err });
    });
}
