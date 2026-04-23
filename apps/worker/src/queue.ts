import { createExperimentQueue, createScoringQueue, createSyncQueue } from '@typhoon/ingestion';
import type { Queue } from 'bullmq';

let _syncQueue: Queue | undefined;
let _scoringQueue: Queue | undefined;
let _experimentQueue: Queue | undefined;

export function initSyncQueue(redisUrl: string): Queue {
  if (_syncQueue) return _syncQueue;
  _syncQueue = createSyncQueue({ url: redisUrl });
  return _syncQueue;
}

export function getSyncQueue(): Queue {
  if (!_syncQueue) throw new Error('Sync queue not initialized');
  return _syncQueue;
}

export function initScoringQueue(redisUrl: string): Queue {
  if (_scoringQueue) return _scoringQueue;
  _scoringQueue = createScoringQueue({ url: redisUrl });
  return _scoringQueue;
}

export function getScoringQueue(): Queue {
  if (!_scoringQueue) throw new Error('Scoring queue not initialized');
  return _scoringQueue;
}

export function initExperimentQueue(redisUrl: string): Queue {
  if (_experimentQueue) return _experimentQueue;
  _experimentQueue = createExperimentQueue({ url: redisUrl });
  return _experimentQueue;
}

export function getExperimentQueue(): Queue {
  if (!_experimentQueue) throw new Error('Experiment queue not initialized');
  return _experimentQueue;
}

export async function shutdownQueues(): Promise<void> {
  await Promise.all([_syncQueue?.close(), _scoringQueue?.close(), _experimentQueue?.close()]);
}
