import { beforeEach, describe, expect, it, vi } from 'vitest';

const invalidateQueries = vi.fn();

vi.mock('@tanstack/react-query', () => ({
  useMutation: vi.fn((config: unknown) => config),
  useQueryClient: vi.fn(() => ({ invalidateQueries })),
}));

vi.mock('@typhoon/ui', () => ({
  apiFetch: vi.fn().mockResolvedValue({ ok: true }),
}));

vi.mock('@typhoon/api-client', async () => {
  const actual = await vi.importActual<typeof import('@typhoon/api-client')>('@typhoon/api-client');
  return { queryKeys: actual.queryKeys };
});

import { queryKeys } from '@typhoon/api-client';
import { apiFetch } from '@typhoon/ui';

import { useCreateAnnotation, useDeleteAnnotation, useUpdateAnnotation } from './use-review-mutations';

describe('useCreateAnnotation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to annotate endpoint', async () => {
    const config = useCreateAnnotation() as unknown as {
      mutationFn: (data: {
        threadId: string;
        messageId: string;
        tags: string[];
        severity?: string;
        comment?: string;
      }) => Promise<unknown>;
    };
    await config.mutationFn({
      threadId: 't-1',
      messageId: 'm-1',
      tags: ['wrong-answer'],
      severity: 'major',
      comment: 'Incorrect answer',
    });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1/messages/m-1/annotate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['wrong-answer'], severity: 'major', comment: 'Incorrect answer' }),
    });
  });

  it('invalidates review detail and all on success', () => {
    const config = useCreateAnnotation() as unknown as {
      onSuccess: (_: unknown, vars: { threadId: string }) => void;
    };
    config.onSuccess(undefined, { threadId: 't-1' } as { threadId: string });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.reviews.detail('t-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.reviews.all });
  });
});

describe('useUpdateAnnotation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH to annotate endpoint', async () => {
    const config = useUpdateAnnotation() as unknown as {
      mutationFn: (data: { threadId: string; messageId: string; tags: string[] }) => Promise<unknown>;
    };
    await config.mutationFn({
      threadId: 't-1',
      messageId: 'm-1',
      tags: ['hallucination'],
    });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1/messages/m-1/annotate', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: ['hallucination'] }),
    });
  });

  it('invalidates review detail and all on success', () => {
    const config = useUpdateAnnotation() as unknown as {
      onSuccess: (_: unknown, vars: { threadId: string }) => void;
    };
    config.onSuccess(undefined, { threadId: 't-1' } as { threadId: string });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.reviews.detail('t-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.reviews.all });
  });
});

describe('useDeleteAnnotation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE to annotate endpoint', async () => {
    const config = useDeleteAnnotation() as unknown as {
      mutationFn: (data: { threadId: string; messageId: string }) => Promise<unknown>;
    };
    await config.mutationFn({ threadId: 't-1', messageId: 'm-1' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/reviews/t-1/messages/m-1/annotate', {
      method: 'DELETE',
    });
  });

  it('invalidates review detail and all on success', () => {
    const config = useDeleteAnnotation() as unknown as {
      onSuccess: (_: unknown, vars: { threadId: string }) => void;
    };
    config.onSuccess(undefined, { threadId: 't-1' } as { threadId: string });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.reviews.detail('t-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.reviews.all });
  });
});
