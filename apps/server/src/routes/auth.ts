import { registerApiRoute } from '@mastra/core/server';
import { auth } from '../auth.js';

export const authRoutes = [
  registerApiRoute('/v1/auth/*', {
    method: 'ALL',
    requiresAuth: false,
    handler: async (c) => {
      return auth.handler(c.req.raw);
    },
  }),
];
