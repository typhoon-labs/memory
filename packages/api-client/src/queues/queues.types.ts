/** A queue summary in the list. */
export interface Queue {
  name: string;
  isPaused: boolean;
  counts: {
    active: number;
    completed: number;
    delayed: number;
    failed: number;
    waiting: number;
    [key: string]: number;
  };
}

/** A worker connected to a queue. */
export interface QueueWorker {
  id: string;
  name: string;
  addr: string;
  age: number;
  [key: string]: unknown;
}

/** A job within a queue. */
export interface QueueJob {
  id: string;
  name: string;
  data: Record<string, unknown>;
  opts: Record<string, unknown>;
  progress: number;
  attemptsMade: number;
  finishedOn: number | null;
  processedOn: number | null;
  timestamp: number;
  failedReason: string | null;
  returnvalue: unknown;
  state: string;
}

/** Paginated job list response. */
export interface QueueJobListResponse {
  jobs: QueueJob[];
  total: number;
}

/** Payload for POST /v1/queues/:name/clean. */
export interface CleanQueueInput {
  state: 'completed' | 'failed' | 'delayed' | 'wait';
  grace?: number;
  limit?: number;
}

/** A failed job archive entry. */
export interface FailedJob {
  id: string;
  queue: string;
  jobId: string;
  name: string;
  data: Record<string, unknown>;
  failedReason: string;
  stacktrace: string[];
  attemptsMade: number;
  timestamp: string;
  createdAt: string;
}

/** Paginated failed job list response. */
export interface FailedJobListResponse {
  jobs: FailedJob[];
  total: number;
}
