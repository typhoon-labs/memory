import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { z } from 'zod';

import { errorResponse } from '../lib/error-response';
import { requireAdmin } from '../middleware/require-admin';
import { requireAuth } from '../middleware/require-auth';
import { getReviewService } from '../services';

function getUserId(c: { get: (key: never) => unknown }): string {
  return (c.get('user' as never) as { id: string }).id;
}

const annotationSchema = z.object({
  tags: z
    .array(z.enum(['wrong-answer', 'hallucination', 'incomplete', 'wrong-source-cited', 'tone-issue', 'correct']))
    .min(1),
  severity: z.enum(['minor', 'major', 'critical']).optional(),
  comment: z.string().optional(),
});

export const reviewRoutes = [
  // List all threads with aggregate score data (admin view)
  registerApiRoute('/v1/admin/reviews', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const sortBy = c.req.query('sortBy') ?? 'newest';
      const annotationStatus = c.req.query('annotationStatus') ?? 'all';

      const result = await getReviewService().listThreadsForReview({ sortBy, annotationStatus });
      if (isError(result)) return errorResponse(c, result);

      return c.json(result.data);
    },
  }),

  // Thread detail with messages + all scores grouped by message
  registerApiRoute('/v1/admin/reviews/:threadId', {
    method: 'GET',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const threadId = c.req.param('threadId');
      const result = await getReviewService().getThreadDetail(threadId);

      if (isError(result)) return errorResponse(c, result);

      return c.json(result.data);
    },
  }),

  // Create human annotation on a message
  registerApiRoute('/v1/admin/reviews/:threadId/messages/:messageId/annotate', {
    method: 'POST',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const threadId = c.req.param('threadId');
      const messageId = c.req.param('messageId');
      const userId = getUserId(c);
      const body = annotationSchema.parse(await c.req.json());

      const result = await getReviewService().createAnnotation({
        threadId,
        messageId,
        userId,
        ...body,
      });

      if (isError(result)) return errorResponse(c, result);

      return c.json(result.data, 201);
    },
  }),

  // Update existing annotation
  registerApiRoute('/v1/admin/reviews/:threadId/messages/:messageId/annotate', {
    method: 'PATCH',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const messageId = c.req.param('messageId');
      const userId = getUserId(c);
      const body = annotationSchema.parse(await c.req.json());

      const result = await getReviewService().updateAnnotation({
        messageId,
        userId,
        ...body,
      });

      if (isError(result)) return errorResponse(c, result);

      return c.json(result.data);
    },
  }),

  // Delete annotation
  registerApiRoute('/v1/admin/reviews/:threadId/messages/:messageId/annotate', {
    method: 'DELETE',
    middleware: [requireAuth, requireAdmin],
    handler: async (c) => {
      const messageId = c.req.param('messageId') as string;
      const userId = getUserId(c);

      const result = await getReviewService().deleteAnnotation({ messageId, userId });

      if (isError(result)) return errorResponse(c, result);

      return c.json(result.data);
    },
  }),
];
