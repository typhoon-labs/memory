import { chatRoute } from '@mastra/ai-sdk';
import { createAppLogger } from '@typhoon/logger';

const log = createAppLogger('chat');

export const chatRoutes = [
  chatRoute({
    path: '/v1/chat/:agentId',
    sendSources: true,
    sendReasoning: false,
    defaultOptions: {
      // Each streaming chunk type (high volume)
      onChunk: (chunk) => {
        log.debug('Stream chunk', { type: (chunk as Record<string, unknown>).type });
      },
      // After each LLM call step — finish reason and token usage
      onStepFinish: ({ text, finishReason, usage }) => {
        log.debug('Step finished', { finishReason, textLength: text?.length, usage });
      },
      // Full completion summary — total steps and aggregate usage
      onFinish: ({ text, finishReason, usage, steps }) => {
        log.debug('Stream complete', {
          finishReason,
          textLength: text?.length,
          steps: steps?.length,
          usage,
        });
      },
      // Stream errors
      onError: (error) => {
        log.error('Stream error', { error });
      },
      // User cancellations
      onAbort: () => {
        log.debug('Stream aborted');
      },
    },
  }),
];
