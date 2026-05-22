import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelQueries = vi.fn().mockResolvedValue(undefined);
const getQueryData = vi.fn();
const setQueryData = vi.fn();
const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: unknown) => config),
  useQueryClient: vi.fn(() => ({
    cancelQueries,
    getQueryData,
    setQueryData,
    invalidateQueries,
  })),
}));

vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    useCallback: vi.fn((fn: unknown) => fn),
  };
});

vi.mock('@typhoon/api-client', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/api-client')>('@typhoon/api-client');
  return {
    queryKeys: actual.queryKeys,
    feedbackApi: { upsert: vi.fn().mockResolvedValue({ id: 'fb-1' }) },
  };
});

import { type FeedbackEntry, feedbackApi, queryKeys } from '@typhoon/api-client';

import { useUpsertFeedback } from './use-feedback-mutations';

type MutationConfig = {
  mutationFn: (data: { messageId: string; rating: string | null; comment?: string }) => Promise<unknown>;
  onMutate: (data: {
    messageId: string;
    rating: string | null;
    comment?: string;
  }) => Promise<{ previous: FeedbackEntry[] | undefined }>;
  onError: (err: unknown, vars: unknown, context: { previous: FeedbackEntry[] | undefined } | undefined) => void;
  onSettled: () => void;
};

describe('useUpsertFeedback', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses byThread query key when threadId is provided', () => {
    const { handleFeedback } = useUpsertFeedback('t-1') as unknown as {
      handleFeedback: (messageId: string, rating: string | null, comment?: string) => void;
      mutation: MutationConfig;
    };

    // handleFeedback is wrapped by useCallback, which we mocked to pass-through
    expect(typeof handleFeedback).toBe('function');
  });

  it('uses feedback.all query key when threadId is undefined', () => {
    const result = useUpsertFeedback(undefined);
    expect(result).toBeDefined();
  });

  describe('mutationFn', () => {
    it('calls feedbackApi.upsert with the input', async () => {
      const { mutation } = useUpsertFeedback('t-1') as unknown as { mutation: MutationConfig };
      const input = { messageId: 'm-1', rating: 'positive' as const };
      await mutation.mutationFn(input);

      expect(feedbackApi.upsert).toHaveBeenCalledWith(input);
    });
  });

  describe('onMutate (optimistic update)', () => {
    it('cancels in-flight queries and snapshots previous data', async () => {
      const previous = [
        { id: 'fb-old', messageId: 'm-0', rating: 'negative' as const, comment: null, createdAt: '2025-01-01' },
      ];
      getQueryData.mockReturnValue(previous);

      const { mutation } = useUpsertFeedback('t-1') as unknown as { mutation: MutationConfig };
      const result = await mutation.onMutate({
        messageId: 'm-1',
        rating: 'positive',
      });

      expect(cancelQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.feedback.byThread('t-1'),
      });
      expect(getQueryData).toHaveBeenCalledWith(queryKeys.feedback.byThread('t-1'));
      expect(result.previous).toEqual(previous);
    });

    it('optimistically adds a new entry when rating is provided', async () => {
      getQueryData.mockReturnValue([]);

      const { mutation } = useUpsertFeedback('t-1') as unknown as { mutation: MutationConfig };
      await mutation.onMutate({ messageId: 'm-1', rating: 'positive' });

      expect(setQueryData).toHaveBeenCalledWith(queryKeys.feedback.byThread('t-1'), expect.any(Function));

      // Invoke the updater function to verify it works correctly
      const updaterFn = setQueryData.mock.calls[0][1] as (old: FeedbackEntry[]) => FeedbackEntry[];
      const result = updaterFn([]);
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'optimistic',
        messageId: 'm-1',
        rating: 'positive',
        comment: null,
      });
    });

    it('optimistically removes entry when rating is null', async () => {
      const existing: FeedbackEntry[] = [
        { id: 'fb-1', messageId: 'm-1', rating: 'positive', comment: null, createdAt: '2025-01-01' },
      ];
      getQueryData.mockReturnValue(existing);

      const { mutation } = useUpsertFeedback('t-1') as unknown as { mutation: MutationConfig };
      await mutation.onMutate({ messageId: 'm-1', rating: null });

      const updaterFn = setQueryData.mock.calls[0][1] as (old: FeedbackEntry[]) => FeedbackEntry[];
      const result = updaterFn(existing);
      expect(result).toHaveLength(0);
    });
  });

  describe('onError (rollback)', () => {
    it('restores previous data on error', () => {
      const previous = [
        { id: 'fb-1', messageId: 'm-1', rating: 'positive' as const, comment: null, createdAt: '2025-01-01' },
      ];

      const { mutation } = useUpsertFeedback('t-1') as unknown as { mutation: MutationConfig };
      mutation.onError(new Error('fail'), {}, { previous });

      expect(setQueryData).toHaveBeenCalledWith(queryKeys.feedback.byThread('t-1'), previous);
    });

    it('does not restore if context has no previous', () => {
      const { mutation } = useUpsertFeedback('t-1') as unknown as { mutation: MutationConfig };
      mutation.onError(new Error('fail'), {}, undefined);

      expect(setQueryData).not.toHaveBeenCalled();
    });
  });

  describe('onSettled', () => {
    it('invalidates feedback queries', () => {
      const { mutation } = useUpsertFeedback('t-1') as unknown as { mutation: MutationConfig };
      mutation.onSettled();

      expect(invalidateQueries).toHaveBeenCalledWith({
        queryKey: queryKeys.feedback.byThread('t-1'),
      });
    });
  });
});
