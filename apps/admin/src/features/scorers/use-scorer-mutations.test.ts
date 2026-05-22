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

import {
  useCreateScorer,
  useCreateScorerVersion,
  useDeleteScorer,
  usePreviewScore,
  usePublishScorerVersion,
  useUpdateScorer,
} from './use-scorer-mutations';

describe('useCreateScorer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and scorer data', async () => {
    const config = useCreateScorer() as unknown as {
      mutationFn: (data: { name: string; type: string }) => Promise<unknown>;
    };
    const input = { name: 'Faithfulness', type: 'llm-judge' };
    await config.mutationFn(input);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('invalidates scorers.all on success', () => {
    const config = useCreateScorer() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.scorers.all });
  });
});

describe('useUpdateScorer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH and status', async () => {
    const config = useUpdateScorer() as unknown as {
      mutationFn: (data: { id: string; status?: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'sc-1', status: 'active' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/sc-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'active' }),
    });
  });

  it('invalidates detail and all on success', () => {
    const config = useUpdateScorer() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'sc-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.scorers.detail('sc-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.scorers.all });
  });
});

describe('useDeleteScorer', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE', async () => {
    const config = useDeleteScorer() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('sc-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/sc-1', { method: 'DELETE' });
  });

  it('invalidates scorers.all on success', () => {
    const config = useDeleteScorer() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.scorers.all });
  });
});

describe('useCreateScorerVersion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to versions endpoint', async () => {
    const config = useCreateScorerVersion() as unknown as {
      mutationFn: (data: { scorerId: string; name: string; type: string }) => Promise<unknown>;
    };
    await config.mutationFn({ scorerId: 'sc-1', name: 'v2', type: 'llm-judge' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/sc-1/versions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'v2', type: 'llm-judge' }),
    });
  });

  it('invalidates scorer detail and all on success', () => {
    const config = useCreateScorerVersion() as unknown as {
      onSuccess: (_: unknown, vars: { scorerId: string }) => void;
    };
    config.onSuccess(undefined, { scorerId: 'sc-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.scorers.detail('sc-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.scorers.all });
  });
});

describe('usePublishScorerVersion', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to publish endpoint with versionId', async () => {
    const config = usePublishScorerVersion() as unknown as {
      mutationFn: (data: { scorerId: string; versionId?: string }) => Promise<unknown>;
    };
    await config.mutationFn({ scorerId: 'sc-1', versionId: 'v-2' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/sc-1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ versionId: 'v-2' }),
    });
  });

  it('calls apiFetch with empty body when no versionId', async () => {
    const config = usePublishScorerVersion() as unknown as {
      mutationFn: (data: { scorerId: string; versionId?: string }) => Promise<unknown>;
    };
    await config.mutationFn({ scorerId: 'sc-1' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/sc-1/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
  });

  it('invalidates scorer detail and all on success', () => {
    const config = usePublishScorerVersion() as unknown as {
      onSuccess: (_: unknown, vars: { scorerId: string }) => void;
    };
    config.onSuccess(undefined, { scorerId: 'sc-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.scorers.detail('sc-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.scorers.all });
  });
});

describe('usePreviewScore', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to preview endpoint', async () => {
    const config = usePreviewScore() as unknown as {
      mutationFn: (data: {
        scorerId: string;
        question: string;
        response: string;
        context: string[];
      }) => Promise<unknown>;
    };
    await config.mutationFn({
      scorerId: 'sc-1',
      question: 'What is X?',
      response: 'X is Y.',
      context: ['context chunk'],
    });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/scorers/sc-1/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: 'What is X?',
        response: 'X is Y.',
        context: ['context chunk'],
      }),
    });
  });

  it('has no onSuccess handler (no cache invalidation)', () => {
    const config = usePreviewScore() as unknown as Record<string, unknown>;
    expect(config.onSuccess).toBeUndefined();
  });
});
