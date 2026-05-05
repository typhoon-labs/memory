import { createQueueRegistry } from '@typhoon/queue';
import type { Queue } from 'bullmq';

const registry = createQueueRegistry();

export function initSyncQueue(redisUrl: string): Queue {
  return registry.init('sync', redisUrl);
}

export function getSyncQueue(): Queue {
  return registry.get('sync');
}

export function initScoringQueue(redisUrl: string): Queue {
  return registry.init('scoring', redisUrl);
}

export function getScoringQueue(): Queue {
  return registry.get('scoring');
}

export function initExperimentQueue(redisUrl: string): Queue {
  return registry.init('experiments', redisUrl);
}

export function getExperimentQueue(): Queue {
  return registry.get('experiments');
}

export async function shutdownQueues(): Promise<void> {
  await registry.shutdown();
}
