import { EventEmitter } from 'node:events';
import { createExperimentQueue, createReportsQueue, createScoringQueue, createSyncQueue } from '@typhoon/ingestion';
import { syncJobCompleted, syncJobDuration, syncJobFailed, syncJobStalled, syncQueueDepth } from '@typhoon/telemetry';
import type { Queue } from 'bullmq';
import { QueueEvents } from 'bullmq';

const _queues = new Map<string, Queue>();
const _events = new Map<string, QueueEvents>();

/** Shared event bus for BullMQ queue events. SSE route subscribes here. */
export const queueEventBus = new EventEmitter();
queueEventBus.setMaxListeners(100);

const SUBSCRIBED_EVENTS = ['waiting', 'active', 'completed', 'failed', 'removed', 'progress', 'stalled'] as const;

/**
 * Initialize a named queue with Redis connection, QueueEvents listener,
 * and OTel metrics. Idempotent — returns existing queue on repeated calls.
 */
export function initQueue(name: string, redisUrl: string): Queue {
  const existing = _queues.get(name);
  if (existing) return existing;

  let queue: Queue;
  switch (name) {
    case 'sync':
      queue = createSyncQueue({ url: redisUrl });
      break;
    case 'reports':
      queue = createReportsQueue({ url: redisUrl });
      break;
    case 'scoring':
      queue = createScoringQueue({ url: redisUrl });
      break;
    case 'experiments':
      queue = createExperimentQueue({ url: redisUrl });
      break;
    default:
      throw new Error(`Unknown queue: ${name}`);
  }

  _queues.set(name, queue);

  const events = new QueueEvents(name, { connection: { url: redisUrl } });
  for (const evt of SUBSCRIBED_EVENTS) {
    // biome-ignore lint/suspicious/noExplicitAny: BullMQ event payloads vary by event type
    events.on(evt, (data: any) => {
      queueEventBus.emit('event', { queue: name, type: evt, ...data });

      // Record OTel metrics for key job lifecycle events
      if (evt === 'completed') {
        syncJobCompleted.add(1, { queue: name, jobName: data.jobId ?? '' });
        if (data.processedOn && data.finishedOn) {
          syncJobDuration.record(data.finishedOn - data.processedOn, { queue: name });
        }
      } else if (evt === 'failed') {
        syncJobFailed.add(1, { queue: name });
      } else if (evt === 'stalled') {
        syncJobStalled.add(1, { queue: name });
      }
    });
  }
  _events.set(name, events);

  // Register observable gauge to poll queue depth at OTel export intervals
  syncQueueDepth.addCallback(async (observer) => {
    try {
      const counts = await queue.getJobCounts('waiting');
      observer.observe(counts.waiting ?? 0, { queue: name });
    } catch {
      // Queue may be closed during shutdown
    }
  });

  return queue;
}

/** Get an initialized queue by name. Throws if not yet initialized. */
export function getQueue(name: string): Queue {
  const queue = _queues.get(name);
  if (!queue) throw new Error(`Queue "${name}" not initialized — call initQueue() first`);
  return queue;
}

/** Return all initialized queues as a read-only map. */
export function getAllQueues(): ReadonlyMap<string, Queue> {
  return _queues;
}

/** Register an external QueueEvents instance for cleanup during shutdown. */
export function trackQueueEvents(key: string, events: QueueEvents) {
  _events.set(key, events);
}

/** Close all QueueEvents listeners and queues. Called on SIGTERM. */
export async function shutdownQueues() {
  await Promise.all([..._events.values()].map((e) => e.close()));
  await Promise.all([..._queues.values()].map((q) => q.close()));
}

/** Shorthand for `initQueue('sync', redisUrl)`. */
export function initSyncQueue(redisUrl: string): Queue {
  return initQueue('sync', redisUrl);
}

/** Shorthand for `getQueue('sync')`. */
export function getSyncQueue(): Queue {
  return getQueue('sync');
}
