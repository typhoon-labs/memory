import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { z } from 'zod';

import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getThreadService } from '../services';

const createThreadSchema = z.object({
  title: z.string().default(''),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const updateThreadSchema = z.object({
  title: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

function getUserId(c: { get: (key: never) => unknown }): string {
  return (c.get('user' as never) as { id: string }).id;
}

export const threadRoutes = [
  // List threads for the authenticated user
  registerApiRoute('/v1/threads', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const page = Number(c.req.query('page') ?? '0');
      const perPage = Number(c.req.query('perPage') ?? '20');

      const result = await getThreadService().listThreads({ userId, page, perPage });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Get a single thread with its messages
  registerApiRoute('/v1/threads/:threadId', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const threadId = c.req.param('threadId');

      const result = await getThreadService().getThread({ threadId, userId });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Create a new thread
  registerApiRoute('/v1/threads', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const body = createThreadSchema.parse(await c.req.json());

      const result = await getThreadService().createThread({
        userId,
        title: body.title,
        metadata: body.metadata ?? {},
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data, 201);
    },
  }),

  // Update a thread
  registerApiRoute('/v1/threads/:threadId', {
    method: 'PATCH',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const threadId = c.req.param('threadId');
      const body = updateThreadSchema.parse(await c.req.json());

      const result = await getThreadService().updateThread({
        threadId,
        userId,
        title: body.title,
        metadata: body.metadata,
      });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Delete a thread and its messages
  registerApiRoute('/v1/threads/:threadId', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const threadId = c.req.param('threadId');

      const result = await getThreadService().deleteThread({ threadId, userId });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
