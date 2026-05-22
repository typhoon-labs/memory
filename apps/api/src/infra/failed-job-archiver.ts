import type { FailedJobRepo } from '@typhoon/db/repos';
import { createAppLogger } from '@typhoon/logger';
import type { RedisProvider } from '@typhoon/queue';
import type { Queue, QueueEvents } from 'bullmq';

const log = createAppLogger('failed-job-archiver');

/**
 * Subscribe to BullMQ `failed` events on the given queue and persist each
 * terminal failure to the `failed_jobs` table in PostgreSQL.
 *
 * Unlike BullMQ's `removeOnFail` TTL (7 days by default), these records are
 * permanent and survive Redis restarts. The archiver never propagates errors
 * — a failed insert is logged and swallowed so it can't disrupt queue
 * event processing.
 */
export function initFailedJobArchiver(queue: Queue, redis: RedisProvider, failedJobRepo: FailedJobRepo): QueueEvents {
  const queueName = queue.name;
  const events = redis.createQueueEvents(queueName);

  events.on('failed', async (args) => {
    try {
      // Look up the full job to get data and stacktrace
      const job = await queue.getJob(args.jobId);
      const data = job?.data as Record<string, unknown> | undefined;

      await failedJobRepo.create({
        queue: queueName,
        jobName: job?.name ?? 'unknown',
        jobId: args.jobId,
        data: data ?? null,
        failedReason: args.failedReason,
        stacktrace: job?.stacktrace?.join('\n') ?? null,
        attemptsMade: job?.attemptsMade ?? 0,
        syncTargetId: (data?.syncTargetId as string) ?? null,
        documentId: (data?.documentId as string) ?? null,
      });

      log.debug('Archived failed job', { queue: queueName, jobId: args.jobId });
    } catch (err) {
      // Never let archival failure disrupt the event pipeline
      log.error('Failed to archive job failure', {
        queue: queueName,
        jobId: args.jobId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return events;
}
