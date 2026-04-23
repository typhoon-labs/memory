import { registerApiRoute } from '@mastra/core/server';
import { auth } from '../auth';

export const authRoutes = [
  registerApiRoute('/v1/auth/*', {
    method: 'ALL',
    requiresAuth: false,
    handler: async (c) => {
      const response = await auth.handler(c.req.raw);
      // Suppress Better Auth's branded HTML error pages to avoid disclosing the auth stack.
      const ct = response.headers.get('content-type') ?? '';
      if (!response.ok && ct.includes('text/html')) {
        return c.json({ error: 'Authentication error' }, response.status as 400);
      }
      return response;
    },
  }),
];
