import { createQueueRegistry, type RedisProvider } from '@typhoon/queue';
import type { Queue } from 'bullmq';

const registry = createQueueRegistry();

export function initSyncQueue(redis: RedisProvider): Queue {
  return registry.init('sync', redis);
}

export function getSyncQueue(): Queue {
  return registry.get('sync');
}

export function initScoringQueue(redis: RedisProvider): Queue {
  return registry.init('scoring', redis);
}

export function getScoringQueue(): Queue {
  return registry.get('scoring');
}

export function initReviewsQueue(redis: RedisProvider): Queue {
  return registry.init('reviews', redis);
}

export function getReviewsQueue(): Queue {
  return registry.get('reviews');
}

export function initExperimentQueue(redis: RedisProvider): Queue {
  return registry.init('experiments', redis);
}

export function getExperimentQueue(): Queue {
  return registry.get('experiments');
}

export function initMaintenanceQueue(redis: RedisProvider): Queue {
  return registry.init('maintenance', redis);
}

export function getMaintenanceQueue(): Queue {
  return registry.get('maintenance');
}

export async function shutdownQueues(): Promise<void> {
  await registry.shutdown();
}
