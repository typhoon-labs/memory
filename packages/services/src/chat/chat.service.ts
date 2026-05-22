import { createAppLogger } from '@typhoon/logger';
import type { ScoringJobData } from '@typhoon/queue';
import type { Queue } from 'bullmq';

import type { Result } from '../types';

const log = createAppLogger('chat-service');

export interface ChatServiceDeps {
  isScoringEnabled: () => boolean;
  sampleRate: number;
}

export interface EnqueueScoringInput {
  threadId: string | undefined;
  agentId: string;
  traceId: string | null;
}

/**
 * ChatService handles post-chat side effects (scoring job enqueue).
 * The actual chat streaming is framework-level (Mastra handleChatStream)
 * and remains in the route layer as an HTTP concern.
 */
export class ChatService {
  private reviewsQueue: Queue | null = null;

  constructor(private deps: ChatServiceDeps) {}

  /** Wire the BullMQ reviews queue at bootstrap time. */
  setReviewsQueue(queue: Queue): void {
    this.reviewsQueue = queue;
  }

  /**
   * Determine whether to enqueue a scoring job and do so if needed.
   * Fire-and-forget — never blocks the caller.
   */
  enqueueScoringJob(input: EnqueueScoringInput): Result<{ enqueued: boolean }> {
    const { threadId, agentId, traceId } = input;
    const scoringEnabled = this.deps.isScoringEnabled() && this.reviewsQueue !== null;
    const shouldScore = scoringEnabled && !!threadId && Math.random() < this.deps.sampleRate;

    if (!shouldScore || !threadId || !this.reviewsQueue) {
      return { data: { enqueued: false } };
    }

    const jobId = `score-${threadId}-${Date.now()}`;
    const queue = this.reviewsQueue;

    queue
      .add(
        'score-message',
        {
          messageId: '', // resolved by the worker from the thread
          threadId,
          agentId,
          traceId,
        } satisfies ScoringJobData,
        {
          jobId,
          delay: 3000, // 3s delay for Mastra to finish persisting the message
        },
      )
      .catch((err) => {
        log.error('Failed to enqueue scoring job', { error: err });
      });

    return { data: { enqueued: true } };
  }
}
