import { chatRoute } from '@mastra/ai-sdk';
import { registerApiRoute } from '@mastra/core/server';

export const widgetRoutes = [
  registerApiRoute('/v1/widget/config', {
    method: 'GET',
    requiresAuth: false,
    handler: async (c) => {
      return c.json({
        name: 'Typhoon Support',
        welcomeMessage: 'Hello! How can I help you today?',
        placeholder: 'Type your question...',
      });
    },
  }),

  // Widget chat streaming — uses the supervisor agent via AG-UI / AI SDK protocol
  chatRoute({
    path: '/v1/widget/chat',
    agent: 'typhoon-supervisor',
    sendSources: true,
    sendReasoning: false,
  }),
];
