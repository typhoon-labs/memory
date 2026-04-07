import { registerApiRoute } from '@mastra/core/server';
import type { Queue } from 'bullmq';
import { streamSSE } from 'hono/streaming';
import { z } from 'zod';
import { requireAuth } from '../middleware/require-auth.js';
import { getAllQueues, getQueue, queueEventBus } from '../queue.js';

function resolveQueue(name: string): Queue | null {
  try {
    return getQueue(name);
  } catch {
    return null;
  }
}

export const queueRoutes = [
  // List all queues with job counts
  registerApiRoute('/v1/queues', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const queues = getAllQueues();
      const results = await Promise.all(
        [...queues.entries()].map(async ([name, queue]) => {
          const [counts, isPaused] = await Promise.all([queue.getJobCounts(), queue.isPaused()]);
          return { name, isPaused, counts };
        }),
      );
      return c.json(results);
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

        // Bun's per-connection idleTimeout is disabled for this stream by
        // the /api/v1/* rewrite in index.ts (server.timeout(req, 0)), so
        // the heartbeat exists purely to keep reverse proxies happy
        // (nginx defaults to 60s read timeout; ours is 300s — see
        // infra/docker/nginx). 30s leaves comfortable margin.
        const heartbeat = setInterval(() => {
          stream.writeSSE({ event: 'ping', data: '' }).catch(() => {});
        }, 30_000);

        stream.onAbort(() => {
          queueEventBus.off('event', onEvent);
          clearInterval(heartbeat);
        });

        // Block until the client disconnects
        await new Promise<void>((resolve) => {
          stream.onAbort(() => resolve());
        });
      });
    },
  }),

  // List workers connected to a queue
  registerApiRoute('/v1/queues/:name/workers', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const queue = resolveQueue(c.req.param('name'));
      if (!queue) return c.json({ error: 'Queue not found' }, 404);

      const workers = await queue.getWorkers();
      const serialized = workers.map((w) => ({
        id: w.id,
        addr: w.addr,
        name: w.name,
        age: Number(w.age),
        idle: Number(w.idle),
      }));
      return c.json(serialized);
    },
  }),

  // List jobs in a queue by state
  registerApiRoute('/v1/queues/:name/jobs', {
    method: 'GET',
    middleware: [requireAuth],
    handler: async (c) => {
      const queue = resolveQueue(c.req.param('name'));
      if (!queue) return c.json({ error: 'Queue not found' }, 404);

      const stateParam = c.req.query('state') ?? 'all';
      const states =
        stateParam === 'all'
          ? (['waiting', 'active', 'completed', 'failed', 'delayed'] as const)
          : ([stateParam] as ('waiting' | 'active' | 'completed' | 'failed' | 'delayed')[]);
      const start = Number(c.req.query('start') ?? '0');
      const pageSize = Math.min(Number(c.req.query('pageSize') ?? '50'), 200);

      const jobs = await queue.getJobs([...states], start, start + pageSize - 1);

      const serialized = await Promise.all(
        jobs.map(async (job) => ({
          id: job.id,
          name: job.name,
          data: job.data,
          state: await job.getState(),
          attemptsMade: job.attemptsMade,
          timestamp: job.timestamp,
          processedOn: job.processedOn ?? null,
          finishedOn: job.finishedOn ?? null,
          failedReason: job.failedReason ?? null,
          returnvalue: job.returnvalue ?? null,
          stacktrace: job.stacktrace ?? [],
          progress: job.progress ?? null,
        })),
      );

      return c.json(serialized);
    },
  }),

  // Pause a queue
  registerApiRoute('/v1/queues/:name/pause', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const queue = resolveQueue(c.req.param('name'));
      if (!queue) return c.json({ error: 'Queue not found' }, 404);
      await queue.pause();
      return c.json({ ok: true });
    },
  }),

  // Resume a queue
  registerApiRoute('/v1/queues/:name/resume', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const queue = resolveQueue(c.req.param('name'));
      if (!queue) return c.json({ error: 'Queue not found' }, 404);
      await queue.resume();
      return c.json({ ok: true });
    },
  }),

  // Clean old jobs
  registerApiRoute('/v1/queues/:name/clean', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const queue = resolveQueue(c.req.param('name'));
      if (!queue) return c.json({ error: 'Queue not found' }, 404);

      const schema = z.object({
        state: z.enum(['completed', 'failed', 'delayed', 'wait']),
        grace: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(10000).default(1000),
      });
      const body = schema.safeParse(await c.req.json());
      if (!body.success) {
        return c.json({ error: 'Invalid request', details: body.error.issues }, 400);
      }

      const removed = await queue.clean(body.data.grace, body.data.limit, body.data.state);
      return c.json({ ok: true, removed: removed.length });
    },
  }),

  // Retry a failed job
  registerApiRoute('/v1/queues/:name/jobs/:jobId/retry', {
    method: 'POST',
    middleware: [requireAuth],
    handler: async (c) => {
      const queue = resolveQueue(c.req.param('name'));
      if (!queue) return c.json({ error: 'Queue not found' }, 404);

      const job = await queue.getJob(c.req.param('jobId'));
      if (!job) return c.json({ error: 'Job not found' }, 404);

      const state = await job.getState();
      if (state !== 'failed') {
        return c.json({ error: `Cannot retry job in state "${state}" — must be failed` }, 400);
      }

      await job.retry();
      return c.json({ ok: true });
    },
  }),

  // Remove a job
  registerApiRoute('/v1/queues/:name/jobs/:jobId', {
    method: 'DELETE',
    middleware: [requireAuth],
    handler: async (c) => {
      const queue = resolveQueue(c.req.param('name'));
      if (!queue) return c.json({ error: 'Queue not found' }, 404);

      const job = await queue.getJob(c.req.param('jobId'));
      if (!job) return c.json({ error: 'Job not found' }, 404);

      const state = await job.getState();
      if (state === 'active') {
        return c.json({ error: 'Cannot remove an active job. Wait for it to finish or stop the worker.' }, 409);
      }

      try {
        await job.remove();
      } catch (err) {
        return c.json({ error: err instanceof Error ? err.message : 'Failed to remove job' }, 409);
      }
      return c.json({ ok: true });
    },
  }),
];
