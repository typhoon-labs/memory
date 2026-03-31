import { chatRoute } from '@mastra/ai-sdk';

export const chatRoutes = [
  chatRoute({
    path: '/v1/chat/:agentId',
    sendSources: true,
    sendReasoning: false,
  }),
];
