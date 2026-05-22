import { registerApiRoute } from '@mastra/core/server';
import { isError } from '@typhoon/services';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';

import { queueEventBus } from '../infra/queue';
import { errorResponse } from '../lib/error-response';
import { requireAuth } from '../middleware/require-auth';
import { getQueueService } from '../services';

export const queueRoutes = [
  // List all queues with job counts
  registerApiRoute('/v1/queues', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().listQueues();
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // SSE stream of queue events (job state changes)
  registerApiRoute('/v1/queues/events', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      return streamSSE(c, async (stream) => {
        let id = 0;
        const onEvent = async (payload: { queue: string; type: string }) => {
          try {
            await stream.writeSSE({
              event: 'queue-event',
              data: JSON.stringify(payload),
              id: String(id++),
            });
          } catch {
            // Stream closed; the abort handler cleans up
          }
        };
        queueEventBus.on('event', onEvent);

        // Tell the browser to reconnect after 5s if the connection drops.
        await stream.writeSSE({ event: 'ping', data: '', retry: 5000 });

        // Heartbeat to keep reverse proxies happy (nginx 300s read timeout).
        const heartbeat = setInterval(() => {
          if (stream.aborted) {
            clearInterval(heartbeat);
            return;
          }
          stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
        }, 30_000);

        // Block until the client disconnects
        await new Promise<void>((resolve) => {
          stream.onAbort(() => {
            queueEventBus.off('event', onEvent);
            clearInterval(heartbeat);
            resolve();
          });
        });
      });
    },
  }),

  // List workers connected to a queue
  registerApiRoute('/v1/queues/:name/workers', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().listWorkers(c.req.param('name'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // List jobs in a queue by state
  registerApiRoute('/v1/queues/:name/jobs', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const stateParam = c.req.query('state') ?? 'all';
      const start = Number(c.req.query('start') ?? '0');
      const pageSize = Number(c.req.query('pageSize') ?? '50');

      const result = await getQueueService().listJobs(c.req.param('name'), stateParam, start, pageSize);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Pause a queue
  registerApiRoute('/v1/queues/:name/pause', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().pauseQueue(c.req.param('name'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Resume a queue
  registerApiRoute('/v1/queues/:name/resume', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().resumeQueue(c.req.param('name'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Clean old jobs
  registerApiRoute('/v1/queues/:name/clean', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const schema = z.object({
        state: z.enum(['completed', 'failed', 'delayed', 'wait']),
        grace: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(10000).default(1000),
      });
      const body = schema.safeParse(await c.req.json());
      if (!body.success) {
        return c.json({ error: 'Invalid request', details: body.error.issues }, 400);
      }

      const result = await getQueueService().cleanQueue(c.req.param('name'), body.data);
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  // Retry a failed job
  registerApiRoute('/v1/queues/:name/jobs/:jobId/retry', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().retryJob(c.req.param('name'), c.req.param('jobId'));
      if (isError(result)) return errorResponse(c, result, 400);
      return c.json(result.data);
    },
  }),

  // Remove a job
  registerApiRoute('/v1/queues/:name/jobs/:jobId', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().removeJob(c.req.param('name'), c.req.param('jobId'));
      if (isError(result)) return errorResponse(c, result, 409);
      return c.json(result.data);
    },
  }),

  // ── Failed Job Archive ───────────────────────────────────────────

  registerApiRoute('/v1/queues/failed-jobs', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const limit = Number(c.req.query('limit') ?? '50');
      const offset = Number(c.req.query('offset') ?? '0');
      const queue = c.req.query('queue');

      const result = await getQueueService().listFailedJobs({ limit, offset, queue });
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/queues/failed-jobs/:id', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().getFailedJob(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),

  registerApiRoute('/v1/queues/failed-jobs/:id', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const result = await getQueueService().deleteFailedJob(c.req.param('id'));
      if (isError(result)) return errorResponse(c, result);
      return c.json(result.data);
    },
  }),
];
