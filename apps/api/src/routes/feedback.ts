import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { z } from 'zod';

import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getFeedbackService } from '../services';

function getUserId(c: { get: (key: never) => unknown }): string {
  return (c.get('user' as never) as { id: string }).id;
}

const upsertFeedbackSchema = z.object({
  messageId: z.string().min(1),
  rating: z.enum(['positive', 'negative']).nullable(),
  comment: z.string().nullable().optional(),
});

export const feedbackRoutes = [
  registerApiRoute('/v1/feedback', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const userId = getUserId(c);
      const body = upsertFeedbackSchema.parse(await c.req.json());

      const result = await getFeedbackService().upsertFeedback({
        messageExternalId: body.messageId,
        userId,
        rating: body.rating,
        comment: body.comment,
      });

      if (isError(result)) return errorResponse(c, result);

      if ('deleted' in result.data) return c.json({ deleted: true });
      if ('_status' in result.data) {
        const { _status, ...rest } = result.data;
        return c.json(rest, 201);
      }
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/feedback', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const threadExternalId = c.req.query('threadId');
      const userId = getUserId(c);

      const result = await getFeedbackService().listFeedback({ threadExternalId, userId });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
