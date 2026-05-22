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
  useAddDatasetItems,
  useCreateDataset,
  useDeleteDataset,
  useDeleteDatasetItem,
  useUpdateDataset,
  useUpdateDatasetItem,
} from './use-dataset-mutations';

describe('useCreateDataset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and serialised body', async () => {
    const config = useCreateDataset() as unknown as {
      mutationFn: (data: { name: string }) => Promise<unknown>;
      onSuccess: () => void;
    };
    const input = { name: 'My Dataset' };
    await config.mutationFn(input);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('invalidates datasets.all on success', () => {
    const config = useCreateDataset() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.datasets.all,
    });
  });
});

describe('useUpdateDataset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH and correct URL', async () => {
    const config = useUpdateDataset() as unknown as {
      mutationFn: (data: { id: string; name: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'ds-1', name: 'Renamed' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
  });

  it('invalidates detail and all on success', () => {
    const config = useUpdateDataset() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'ds-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.datasets.detail('ds-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.datasets.all,
    });
  });
});

describe('useDeleteDataset', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE', async () => {
    const config = useDeleteDataset() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('ds-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1', {
      method: 'DELETE',
    });
  });

  it('invalidates datasets.all on success', () => {
    const config = useDeleteDataset() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.datasets.all,
    });
  });
});

describe('useAddDatasetItems', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and items payload', async () => {
    const config = useAddDatasetItems() as unknown as {
      mutationFn: (data: { datasetId: string; items: Record<string, unknown>[] }) => Promise<unknown>;
    };
    const items = [{ question: 'Q1' }];
    await config.mutationFn({ datasetId: 'ds-1', items });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
  });

  it('invalidates dataset detail on success', () => {
    const config = useAddDatasetItems() as unknown as {
      onSuccess: (_: unknown, vars: { datasetId: string }) => void;
    };
    config.onSuccess(undefined, { datasetId: 'ds-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.datasets.detail('ds-1'),
    });
  });
});

describe('useUpdateDatasetItem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH for a specific item', async () => {
    const config = useUpdateDatasetItem() as unknown as {
      mutationFn: (data: { datasetId: string; itemId: string; data: Record<string, unknown> }) => Promise<unknown>;
    };
    const data = { question: 'Updated Q' };
    await config.mutationFn({ datasetId: 'ds-1', itemId: 'item-1', data });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items/item-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  });

  it('invalidates dataset detail on success', () => {
    const config = useUpdateDatasetItem() as unknown as {
      onSuccess: (_: unknown, vars: { datasetId: string }) => void;
    };
    config.onSuccess(undefined, { datasetId: 'ds-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.datasets.detail('ds-1'),
    });
  });
});

describe('useDeleteDatasetItem', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE for a specific item', async () => {
    const config = useDeleteDatasetItem() as unknown as {
      mutationFn: (data: { datasetId: string; itemId: string }) => Promise<unknown>;
    };
    await config.mutationFn({ datasetId: 'ds-1', itemId: 'item-1' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/admin/datasets/ds-1/items/item-1', {
      method: 'DELETE',
    });
  });

  it('invalidates dataset detail on success', () => {
    const config = useDeleteDatasetItem() as unknown as {
      onSuccess: (_: unknown, vars: { datasetId: string }) => void;
    };
    config.onSuccess(undefined, { datasetId: 'ds-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.datasets.detail('ds-1'),
    });
  });
});
