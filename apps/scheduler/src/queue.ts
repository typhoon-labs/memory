import { createSyncQueue } from '@typhoon/ingestion';
import type { Queue } from 'bullmq';

let _syncQueue: Queue | undefined;

export function initSyncQueue(redisUrl: string): Queue {
  if (_syncQueue) return _syncQueue;
  _syncQueue = createSyncQueue({ url: redisUrl });
  return _syncQueue;
}

export function getSyncQueue(): Queue {
  if (!_syncQueue) throw new Error('Sync queue not initialized');
  return _syncQueue;
}

export async function shutdownQueues(): Promise<void> {
  if (_syncQueue) await _syncQueue.close();
}
