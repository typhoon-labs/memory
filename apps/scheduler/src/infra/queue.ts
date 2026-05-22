import { createQueueRegistry, type RedisProvider } from '@typhoon/queue';
import type { Queue } from 'bullmq';

const registry = createQueueRegistry();

export function initSyncQueue(redis: RedisProvider): Queue {
  return registry.init('sync', redis);
}

export function getSyncQueue(): Queue {
  return registry.get('sync');
}

export async function shutdownQueues(): Promise<void> {
  await registry.shutdown();
}
