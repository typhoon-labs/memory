import { EventEmitter } from 'node:events';
import { createReportsQueue, createSyncQueue } from '@typhoon/ingestion';
import type { Queue } from 'bullmq';
import { QueueEvents } from 'bullmq';

const _queues = new Map<string, Queue>();
const _events = new Map<string, QueueEvents>();

export const queueEventBus = new EventEmitter();
queueEventBus.setMaxListeners(100);

const SUBSCRIBED_EVENTS = ['waiting', 'active', 'completed', 'failed', 'removed', 'progress', 'stalled'] as const;

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
    default:
      throw new Error(`Unknown queue: ${name}`);
  }

  _queues.set(name, queue);

  const events = new QueueEvents(name, { connection: { url: redisUrl } });
  for (const evt of SUBSCRIBED_EVENTS) {
    // biome-ignore lint/suspicious/noExplicitAny: BullMQ event payloads vary by event type
    events.on(evt, (data: any) => {
      queueEventBus.emit('event', { queue: name, type: evt, ...data });
    });
  }
  _events.set(name, events);

  return queue;
}

export function getQueue(name: string): Queue {
  const queue = _queues.get(name);
  if (!queue) throw new Error(`Queue "${name}" not initialized — call initQueue() first`);
  return queue;
}

export function getAllQueues(): ReadonlyMap<string, Queue> {
  return _queues;
}

export async function shutdownQueues() {
  await Promise.all([..._events.values()].map((e) => e.close()));
  await Promise.all([..._queues.values()].map((q) => q.close()));
}

// Backward-compatible wrappers
export function initSyncQueue(redisUrl: string): Queue {
  return initQueue('sync', redisUrl);
}

export function getSyncQueue(): Queue {
  return getQueue('sync');
}
