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
  useCreateSyncTarget,
  useDeleteSyncTarget,
  usePurgeSource,
  useSyncTarget,
  useUpdateSyncTarget,
  useUploadFiles,
} from './use-sync-target-mutations';

describe('useCreateSyncTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and sync target data', async () => {
    const config = useCreateSyncTarget() as unknown as {
      mutationFn: (data: { name: string; sourceType: string; config: Record<string, unknown> }) => Promise<unknown>;
    };
    const input = { name: 'S3 Bucket', sourceType: 's3', config: { prefix: 'docs/' } };
    await config.mutationFn(input);

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync-targets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
  });

  it('invalidates syncTargets.all on success', () => {
    const config = useCreateSyncTarget() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.syncTargets.all });
  });
});

describe('useUpdateSyncTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with PATCH for a specific sync target', async () => {
    const config = useUpdateSyncTarget() as unknown as {
      mutationFn: (data: { id: string; name?: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'st-1', name: 'Renamed' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Renamed' }),
    });
  });

  it('invalidates detail and all on success', () => {
    const config = useUpdateSyncTarget() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'st-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.detail('st-1'),
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.syncTargets.all });
  });
});

describe('useDeleteSyncTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with DELETE', async () => {
    const config = useDeleteSyncTarget() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('st-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1', { method: 'DELETE' });
  });

  it('invalidates syncTargets.all on success', () => {
    const config = useDeleteSyncTarget() as unknown as { onSuccess: () => void };
    config.onSuccess();

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.syncTargets.all });
  });
});

describe('useSyncTarget', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to sync endpoint with force flag', async () => {
    const config = useSyncTarget() as unknown as {
      mutationFn: (data: { id: string; force?: boolean }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'st-1', force: true });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: true }),
    });
  });

  it('defaults force to false', async () => {
    const config = useSyncTarget() as unknown as {
      mutationFn: (data: { id: string }) => Promise<unknown>;
    };
    await config.mutationFn({ id: 'st-1' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force: false }),
    });
  });

  it('invalidates syncTargets.jobs on success', () => {
    const config = useSyncTarget() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'st-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.jobs('st-1'),
    });
  });
});

describe('useUploadFiles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST and FormData', async () => {
    const config = useUploadFiles() as unknown as {
      mutationFn: (data: { id: string; files: File[]; path?: string }) => Promise<unknown>;
    };
    const file = new File(['content'], 'test.pdf', { type: 'application/pdf' });
    await config.mutationFn({ id: 'st-1', files: [file], path: 'docs/' });

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/upload', {
      method: 'POST',
      body: expect.any(FormData),
    });
  });

  it('invalidates browse and documents.all on success', () => {
    const config = useUploadFiles() as unknown as {
      onSuccess: (_: unknown, vars: { id: string }) => void;
    };
    config.onSuccess(undefined, { id: 'st-1' });

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ['sync-targets', 'browse', 'st-1'],
    });
    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
  });
});

describe('usePurgeSource', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls apiFetch with POST to purge endpoint', async () => {
    const config = usePurgeSource() as unknown as {
      mutationFn: (id: string) => Promise<unknown>;
    };
    await config.mutationFn('st-1');

    expect(apiFetch).toHaveBeenCalledWith('/api/v1/sync-targets/st-1/purge', { method: 'POST' });
  });

  it('invalidates documents.all and syncTargets.jobs on success', () => {
    const config = usePurgeSource() as unknown as {
      onSuccess: (_: unknown, id: string) => void;
    };
    config.onSuccess(undefined, 'st-1');

    expect(invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.documents.all });
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: queryKeys.syncTargets.jobs('st-1'),
    });
  });
});
