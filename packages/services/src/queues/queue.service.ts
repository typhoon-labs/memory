import type { FailedJobRepo } from '@typhoon/db/repos';
import type { Queue } from 'bullmq';

import type { Result } from '../types';

export interface QueueServiceDeps {
  getAllQueues: () => ReadonlyMap<string, Queue>;
  getQueue: (name: string) => Queue;
  failedJobRepo: FailedJobRepo;
}

export interface QueueInfo {
  name: string;
  isPaused: boolean;
  counts: Record<string, number>;
}

export interface SerializedJob {
  id: string | undefined;
  name: string;
  data: unknown;
  state: string;
  attemptsMade: number;
  timestamp: number;
  processedOn: number | null;
  finishedOn: number | null;
  failedReason: string | null;
  returnvalue: unknown;
  stacktrace: string[];
  progress: unknown;
}

export interface SerializedWorker {
  id: string;
  addr: string;
  name: string;
  age: number;
  idle: number;
}

export interface FailedJobsFilter {
  limit: number;
  offset: number;
  queue?: string;
}

export interface CleanInput {
  state: 'completed' | 'failed' | 'delayed' | 'wait';
  grace: number;
  limit: number;
}

export class QueueService {
  constructor(private deps: QueueServiceDeps) {}

  /** List all registered queues with their job counts and pause state. */
  async listQueues(): Promise<Result<QueueInfo[]>> {
    const queues = this.deps.getAllQueues();
    const results = await Promise.all(
      [...queues.entries()].map(async ([name, queue]) => {
        const [counts, isPaused] = await Promise.all([queue.getJobCounts(), queue.isPaused()]);
        return { name, isPaused, counts };
      }),
    );
    return { data: results };
  }

  /** List workers connected to a specific queue. */
  async listWorkers(queueName: string): Promise<Result<SerializedWorker[]>> {
    const queue = this.resolveQueue(queueName);
    if (!queue) return { error: 'Queue not found' };

    const workers = await queue.getWorkers();
    const serialized = workers.map((w) => ({
      id: w.id,
      addr: w.addr,
      name: w.name,
      age: Number(w.age),
      idle: Number(w.idle),
    }));
    return { data: serialized };
  }

  /** List jobs in a queue filtered by state with pagination. */
  async listJobs(
    queueName: string,
    stateParam: string,
    start: number,
    pageSize: number,
  ): Promise<Result<SerializedJob[]>> {
    const queue = this.resolveQueue(queueName);
    if (!queue) return { error: 'Queue not found' };

    const states =
      stateParam === 'all'
        ? (['waiting', 'active', 'completed', 'failed', 'delayed'] as const)
        : ([stateParam] as ('waiting' | 'active' | 'completed' | 'failed' | 'delayed')[]);
    const effectivePageSize = Math.min(pageSize, 200);

    const jobs = await queue.getJobs([...states], start, start + effectivePageSize - 1);

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

    return { data: serialized };
  }

  /** Pause a queue. */
  async pauseQueue(queueName: string): Promise<Result<{ ok: true }>> {
    const queue = this.resolveQueue(queueName);
    if (!queue) return { error: 'Queue not found' };
    await queue.pause();
    return { data: { ok: true } };
  }

  /** Resume a queue. */
  async resumeQueue(queueName: string): Promise<Result<{ ok: true }>> {
    const queue = this.resolveQueue(queueName);
    if (!queue) return { error: 'Queue not found' };
    await queue.resume();
    return { data: { ok: true } };
  }

  /** Clean old jobs from a queue. */
  async cleanQueue(queueName: string, input: CleanInput): Promise<Result<{ ok: true; removed: number }>> {
    const queue = this.resolveQueue(queueName);
    if (!queue) return { error: 'Queue not found' };

    const removed = await queue.clean(input.grace, input.limit, input.state);
    return { data: { ok: true, removed: removed.length } };
  }

  /** Retry a failed job. */
  async retryJob(queueName: string, jobId: string): Promise<Result<{ ok: true }>> {
    const queue = this.resolveQueue(queueName);
    if (!queue) return { error: 'Queue not found' };

    const job = await queue.getJob(jobId);
    if (!job) return { error: 'Job not found' };

    const state = await job.getState();
    if (state !== 'failed') {
      return { error: `Cannot retry job in state "${state}" — must be failed` };
    }

    await job.retry();
    return { data: { ok: true } };
  }

  /** Remove a job from a queue. */
  async removeJob(queueName: string, jobId: string): Promise<Result<{ ok: true }>> {
    const queue = this.resolveQueue(queueName);
    if (!queue) return { error: 'Queue not found' };

    const job = await queue.getJob(jobId);
    if (!job) return { error: 'Job not found' };

    const state = await job.getState();
    if (state === 'active') {
      return { error: 'Cannot remove an active job. Wait for it to finish or stop the worker.' };
    }

    try {
      await job.remove();
    } catch (err) {
      return { error: err instanceof Error ? err.message : 'Failed to remove job' };
    }
    return { data: { ok: true } };
  }

  /** List archived failed jobs with optional queue filter. */
  async listFailedJobs(filter: FailedJobsFilter): Promise<Result<unknown[]>> {
    const jobs = await this.deps.failedJobRepo.list({
      limit: filter.limit,
      offset: filter.offset,
      queue: filter.queue,
    });
    return { data: jobs };
  }

  /** Get a single archived failed job by ID. */
  async getFailedJob(id: string): Promise<Result<unknown>> {
    const job = await this.deps.failedJobRepo.findById(id);
    if (!job) return { error: 'Not found' };
    return { data: job };
  }

  /** Delete an archived failed job by ID. */
  async deleteFailedJob(id: string): Promise<Result<{ ok: true }>> {
    await this.deps.failedJobRepo.delete(id);
    return { data: { ok: true } };
  }

  /** Resolve a queue by name, returning null if not found. */
  private resolveQueue(name: string): Queue | null {
    try {
      return this.deps.getQueue(name);
    } catch {
      return null;
    }
  }
}
