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

import { useDeleteThread } from './use-thread-mutations';

describe('useDeleteThread', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE to thread endpoint', async () => {
    const config = useDeleteThread() as unknown as {
      mutationFn: (threadId: string) => Promise<unknown>;
    };
    await config.mutationFn('thread-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/threads/thread-1', { method: 'DELETE' });
  });

  it('invalidates threads.all on success', () => {
    const config = useDeleteThread() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.threads.all });
  });
});
