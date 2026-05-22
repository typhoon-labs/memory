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

import { useCreateExperiment, useDeleteExperiment } from './use-experiment-mutations';

describe('useCreateExperiment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and experiment data', async () => {
    const config = useCreateExperiment() as unknown as {
      mutationFn: (data: { datasetId: string; name?: string }) => Promise<unknown>;
    };
    const input = { datasetId: 'ds-1', name: 'Experiment A' };
    await config.mutationFn(input);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('invalidates experiments.all on success', () => {
    const config = useCreateExperiment() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.experiments.all,
    });
  });
});

describe('useDeleteExperiment', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE', async () => {
    const config = useDeleteExperiment() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('exp-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/experiments/exp-1', {
      method: 'DELETE',
    });
  });

  it('invalidates experiments.all on success', () => {
    const config = useDeleteExperiment() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.experiments.all,
    });
  });
});
