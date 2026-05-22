import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@typhoon/logger', () => ({
  createAppLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@typhoon/queue', () => ({}));

import { ChatService } from './chat.service';

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ChatService({
      isScoringEnabled: () => true,
      sampleRate: 1.0,
    });
  });

  describe('enqueueScoringJob', () => {
    it('does not enqueue when no reviews queue is set', () => {
      const result = service.enqueueScoringJob({ threadId: 'thread-1', agentId: 'agent-1', traceId: 'trace-1' });
      expect(result).toEqual({ data: { enqueued: false } });
    });

    it('does not enqueue when threadId is undefined', () => {
      const mockAdd = vi.fn().mockResolvedValue({});
      service.setReviewsQueue({ add: mockAdd } as never);

      const result = service.enqueueScoringJob({ threadId: undefined, agentId: 'agent-1', traceId: 'trace-1' });
      expect(result).toEqual({ data: { enqueued: false } });
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('enqueues when all conditions met', () => {
      const mockAdd = vi.fn().mockResolvedValue({});
      service.setReviewsQueue({ add: mockAdd } as never);

      const result = service.enqueueScoringJob({ threadId: 'thread-1', agentId: 'agent-1', traceId: 'trace-1' });
      expect(result).toEqual({ data: { enqueued: true } });
      expect(mockAdd).toHaveBeenCalledWith(
        'score-message',
        expect.objectContaining({ threadId: 'thread-1', agentId: 'agent-1', traceId: 'trace-1' }),
        expect.objectContaining({ delay: 3000 }),
      );
    });

    it('does not enqueue when scoring is disabled', () => {
      service = new ChatService({
        isScoringEnabled: () => false,
        sampleRate: 1.0,
      });
      const mockAdd = vi.fn().mockResolvedValue({});
      service.setReviewsQueue({ add: mockAdd } as never);

      const result = service.enqueueScoringJob({ threadId: 'thread-1', agentId: 'agent-1', traceId: 'trace-1' });
      expect(result).toEqual({ data: { enqueued: false } });
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('does not enqueue when sample rate is 0', () => {
      service = new ChatService({
        isScoringEnabled: () => true,
        sampleRate: 0,
      });
      const mockAdd = vi.fn().mockResolvedValue({});
      service.setReviewsQueue({ add: mockAdd } as never);

      const result = service.enqueueScoringJob({ threadId: 'thread-1', agentId: 'agent-1', traceId: 'trace-1' });
      expect(result).toEqual({ data: { enqueued: false } });
      expect(mockAdd).not.toHaveBeenCalled();
    });

    it('handles queue.add failure gracefully', async () => {
      const mockAdd = vi.fn().mockRejectedValue(new Error('Redis down'));
      service.setReviewsQueue({ add: mockAdd } as never);

      // Should not throw
      const result = service.enqueueScoringJob({ threadId: 'thread-1', agentId: 'agent-1', traceId: 'trace-1' });
      expect(result).toEqual({ data: { enqueued: true } });

      // Wait for the fire-and-forget promise to reject (caught internally)
      await new Promise((r) => setTimeout(r, 10));
    });
  });
});
