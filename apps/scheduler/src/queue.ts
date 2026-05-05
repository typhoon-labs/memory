import { createQueueRegistry } from '@typhoon/queue';
import type { Queue } from 'bullmq';

const registry = createQueueRegistry();

export function initSyncQueue(redisUrl: string): Queue {
  return registry.init('sync', redisUrl);
}

export function getSyncQueue(): Queue {
  return registry.get('sync');
}

export async function shutdownQueues(): Promise<void> {
  await registry.shutdown();
}
